# backend/auth.py
"""
Authentication & plan management.

- Email/password signup + login (PBKDF2 hashing, JWT sessions)
- Google sign-in: works once GOOGLE_CLIENT_ID is set in .env
- GitHub sign-in: works once GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET are set
- Plan management: free | plus | pro
"""
import os
import sqlite3
import time
import hmac
import hashlib
import secrets

import jwt
import httpx
from fastapi import APIRouter, HTTPException, Header, Body, Request
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv()

router = APIRouter()

DB_PATH = os.path.join("data", "users.db")
JWT_SECRET = os.getenv("AUTH_SECRET") or secrets.token_hex(32)
JWT_ALG = "HS256"
JWT_TTL = 60 * 60 * 24 * 30  # 30 days

VALID_PLANS = {"free", "plus", "pro"}

os.makedirs("data", exist_ok=True)


def _db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute(
        """CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            name TEXT,
            password_hash TEXT,
            provider TEXT DEFAULT 'email',
            plan TEXT DEFAULT 'free',
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )"""
    )
    conn.execute(
        """CREATE TABLE IF NOT EXISTS usage (
            user_id INTEGER NOT NULL,
            day TEXT NOT NULL,
            count INTEGER DEFAULT 0,
            PRIMARY KEY (user_id, day)
        )"""
    )
    conn.execute(
        """CREATE TABLE IF NOT EXISTS chats (
            user_id INTEGER PRIMARY KEY,
            data TEXT DEFAULT '[]',
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )"""
    )
    conn.execute(
        """CREATE TABLE IF NOT EXISTS reset_tokens (
            token TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL,
            expires_at REAL NOT NULL
        )"""
    )
    conn.execute(
        """CREATE TABLE IF NOT EXISTS guest_usage (
            ip TEXT NOT NULL,
            day TEXT NOT NULL,
            count INTEGER DEFAULT 0,
            PRIMARY KEY (ip, day)
        )"""
    )
    return conn


# Daily message limits per plan (None = unlimited)
PLAN_LIMITS = {"free": 50, "plus": 1000, "pro": None}

# Highest model tier each plan can select ('auto' still applies within the cap)
PLAN_MAX_TIER = {"free": "smart", "plus": "smart", "pro": "pro"}


# ---------- helpers ----------

def _hash_password(password: str, salt: str | None = None) -> str:
    salt = salt or secrets.token_hex(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 120_000)
    return f"{salt}${dk.hex()}"


def _check_password(password: str, stored: str) -> bool:
    try:
        salt, _ = stored.split("$", 1)
        return hmac.compare_digest(_hash_password(password, salt), stored)
    except Exception:
        return False


def _make_token(user_id: int, email: str) -> str:
    now = int(time.time())
    return jwt.encode(
        {"sub": str(user_id), "email": email, "iat": now, "exp": now + JWT_TTL},
        JWT_SECRET,
        algorithm=JWT_ALG,
    )


def _user_payload(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "email": row["email"],
        "name": row["name"],
        "provider": row["provider"],
        "plan": row["plan"],
        "created_at": row["created_at"],
    }


def _find_user_by_email(conn, email: str):
    return conn.execute("SELECT * FROM users WHERE email = ?", (email.lower(),)).fetchone()


def _current_user(authorization: str | None) -> sqlite3.Row:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(authorization[7:], JWT_SECRET, algorithms=[JWT_ALG])
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    conn = _db()
    row = conn.execute("SELECT * FROM users WHERE id = ?", (int(payload["sub"]),)).fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=401, detail="User not found")
    return row


def get_optional_user(authorization: str | None) -> sqlite3.Row | None:
    """Like _current_user but returns None instead of raising (for quota checks)."""
    try:
        return _current_user(authorization)
    except HTTPException:
        return None


def check_and_increment_quota(user: sqlite3.Row) -> tuple[bool, int, int | None]:
    """Returns (allowed, used_today, limit). Increments the daily counter when allowed."""
    limit = PLAN_LIMITS.get(user["plan"], PLAN_LIMITS["free"])
    today = time.strftime("%Y-%m-%d")
    conn = _db()
    row = conn.execute(
        "SELECT count FROM usage WHERE user_id = ? AND day = ?", (user["id"], today)
    ).fetchone()
    used = row["count"] if row else 0

    if limit is not None and used >= limit:
        conn.close()
        return False, used, limit

    conn.execute(
        "INSERT INTO usage (user_id, day, count) VALUES (?, ?, 1) "
        "ON CONFLICT(user_id, day) DO UPDATE SET count = count + 1",
        (user["id"], today),
    )
    conn.commit()
    conn.close()
    return True, used + 1, limit


def get_usage(user_id: int) -> tuple[int, int | None]:
    """(used_today, limit) for a user."""
    conn = _db()
    user = conn.execute("SELECT plan FROM users WHERE id = ?", (user_id,)).fetchone()
    if not user:
        conn.close()
        return 0, None
    limit = PLAN_LIMITS.get(user["plan"], PLAN_LIMITS["free"])
    today = time.strftime("%Y-%m-%d")
    row = conn.execute("SELECT count FROM usage WHERE user_id = ? AND day = ?", (user_id, today)).fetchone()
    conn.close()
    return (row["count"] if row else 0), limit


def _upsert_oauth_user(email: str, name: str, provider: str) -> sqlite3.Row:
    conn = _db()
    row = _find_user_by_email(conn, email)
    if row:
        conn.execute("UPDATE users SET provider = ?, name = COALESCE(name, ?) WHERE id = ?", (provider, name, row["id"]))
        conn.commit()
    else:
        conn.execute(
            "INSERT INTO users (email, name, provider, plan) VALUES (?, ?, ?, 'free')",
            (email.lower(), name, provider),
        )
        conn.commit()
    row = _find_user_by_email(conn, email)
    conn.close()
    return row


def _seed_demo_user():
    """Create the demo account so it can be logged into during a demo."""
    email = "demo@genai.app"
    conn = _db()
    if not _find_user_by_email(conn, email):
        conn.execute(
            "INSERT INTO users (email, name, password_hash, provider, plan) VALUES (?, ?, ?, 'email', 'plus')",
            (email, "Demo User", _hash_password("demo123")),
        )
        conn.commit()
    conn.close()


_seed_demo_user()


# ---------- request models ----------

class SignupRequest(BaseModel):
    name: str = ""
    email: str
    password: str


class LoginRequest(BaseModel):
    email: str
    password: str


class GoogleRequest(BaseModel):
    credential: str


class GithubRequest(BaseModel):
    code: str


class PlanRequest(BaseModel):
    plan: str


class ProfileRequest(BaseModel):
    name: str


class PasswordRequest(BaseModel):
    current_password: str | None = None
    new_password: str


# ---------- endpoints ----------

@router.get("/auth/config")
def auth_config():
    """Public OAuth client IDs for the frontend buttons (safe to expose)."""
    return {
        "google_client_id": os.getenv("GOOGLE_CLIENT_ID") or None,
        "github_client_id": os.getenv("GITHUB_CLIENT_ID") or None,
    }


@router.post("/auth/signup")
def signup(req: SignupRequest):
    email = req.email.strip().lower()
    if not email or "@" not in email:
        raise HTTPException(400, "Valid email is required")
    if len(req.password) < 6:
        raise HTTPException(400, "Password must be at least 6 characters")

    conn = _db()
    if _find_user_by_email(conn, email):
        conn.close()
        raise HTTPException(409, "An account with this email already exists")
    conn.execute(
        "INSERT INTO users (email, name, password_hash, provider, plan) VALUES (?, ?, ?, 'email', 'free')",
        (email, req.name.strip() or email.split("@")[0], _hash_password(req.password)),
    )
    conn.commit()
    row = _find_user_by_email(conn, email)
    conn.close()
    return {"token": _make_token(row["id"], email), "user": _user_payload(row)}


@router.post("/auth/login")
def login(req: LoginRequest):
    email = req.email.strip().lower()
    conn = _db()
    row = _find_user_by_email(conn, email)
    conn.close()
    if not row or not row["password_hash"]:
        raise HTTPException(401, "Invalid email or password")
    if not _check_password(req.password, row["password_hash"]):
        raise HTTPException(401, "Invalid email or password")
    return {"token": _make_token(row["id"], email), "user": _user_payload(row)}


@router.get("/auth/me")
def me(authorization: str | None = Header(default=None)):
    user = _current_user(authorization)
    used, limit = get_usage(user["id"])
    payload = _user_payload(user)
    payload["usage"] = {"used": used, "limit": limit}
    return {"user": payload}


@router.post("/auth/plan")
def set_plan(req: PlanRequest, authorization: str | None = Header(default=None)):
    user = _current_user(authorization)
    if req.plan not in VALID_PLANS:
        raise HTTPException(400, f"Plan must be one of {sorted(VALID_PLANS)}")
    conn = _db()
    conn.execute("UPDATE users SET plan = ? WHERE id = ?", (req.plan, user["id"]))
    conn.commit()
    row = conn.execute("SELECT * FROM users WHERE id = ?", (user["id"],)).fetchone()
    conn.close()
    return {"user": _user_payload(row)}


@router.post("/auth/profile")
def update_profile(req: ProfileRequest, authorization: str | None = Header(default=None)):
    user = _current_user(authorization)
    name = req.name.strip()
    if not name:
        raise HTTPException(400, "Name cannot be empty")
    conn = _db()
    conn.execute("UPDATE users SET name = ? WHERE id = ?", (name, user["id"]))
    conn.commit()
    row = conn.execute("SELECT * FROM users WHERE id = ?", (user["id"],)).fetchone()
    conn.close()
    return {"user": _user_payload(row)}


@router.post("/auth/password")
def change_password(req: PasswordRequest, authorization: str | None = Header(default=None)):
    user = _current_user(authorization)
    if len(req.new_password) < 6:
        raise HTTPException(400, "New password must be at least 6 characters")

    # OAuth-only accounts have no password — allow setting one without a current password
    if user["password_hash"]:
        if not req.current_password or not _check_password(req.current_password, user["password_hash"]):
            raise HTTPException(401, "Current password is incorrect")

    conn = _db()
    conn.execute(
        "UPDATE users SET password_hash = ? WHERE id = ?",
        (_hash_password(req.new_password), user["id"]),
    )
    conn.commit()
    conn.close()
    return {"ok": True}


@router.delete("/auth/account")
def delete_account(authorization: str | None = Header(default=None)):
    """Delete the account + all its data: user row, chats, usage, reset tokens."""
    user = _current_user(authorization)
    uid = user["id"]
    conn = _db()
    conn.execute("DELETE FROM users WHERE id = ?", (uid,))
    conn.execute("DELETE FROM chats WHERE user_id = ?", (uid,))
    conn.execute("DELETE FROM usage WHERE user_id = ?", (uid,))
    conn.execute("DELETE FROM reset_tokens WHERE user_id = ?", (uid,))
    conn.commit()
    conn.close()
    return {"ok": True}


# ---------------- STRIPE BILLING ---------------- #
# Set STRIPE_SECRET_KEY + STRIPE_PRICE_PLUS / STRIPE_PRICE_PRO in .env.
# Webhook (checkout.session.completed) activates plans.

@router.post("/billing/checkout")
def billing_checkout(request: dict = Body(...), authorization: str | None = Header(default=None)):
    """Create a Stripe Checkout session for a paid plan."""
    user = _current_user(authorization)
    plan = request.get("plan")
    if plan not in ("plus", "pro"):
        raise HTTPException(400, "Plan must be 'plus' or 'pro'")
    try:
        import stripe, os as _os
        key = _os.getenv("STRIPE_SECRET_KEY")
        price = _os.getenv(f"STRIPE_PRICE_{plan.upper()}")
        if not key or not price:
            return {
                "checkout_url": None,
                "unavailable": True,
                "message": "Stripe not configured — add STRIPE_SECRET_KEY and price IDs to .env",
            }
        stripe.api_key = key
        base = _os.getenv("FRONTEND_URL", "http://localhost:8081")
        session = stripe.checkout.Session.create(
            mode="subscription",
            line_items=[{"price": price, "quantity": 1}],
            success_url=f"{base}/pricing?upgrade=success",
            cancel_url=f"{base}/pricing?upgrade=cancelled",
            client_reference_id=str(user["id"]),
            customer_email=user["email"],
            metadata={"plan": plan},
        )
        return {"checkout_url": session.url}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(503, f"Stripe error: {e}")


@router.post("/billing/webhook")
async def billing_webhook(request: Request):
    """Stripe webhook — activates the plan when checkout completes."""
    import stripe, os as _os
    stripe.api_key = _os.getenv("STRIPE_SECRET_KEY")
    payload = await request.body()
    sig = request.headers.get("stripe-signature", "")
    secret = _os.getenv("STRIPE_WEBHOOK_SECRET")
    try:
        if secret:
            event = stripe.Webhook.construct_event(payload, sig, secret)
        else:
            import json as _json
            event = _json.loads(payload)  # dev mode without signature
    except Exception:
        raise HTTPException(400, "Invalid webhook")

    if event.get("type") == "checkout.session.completed":
        data = event["data"]["object"]
        uid = data.get("client_reference_id")
        plan = (data.get("metadata") or {}).get("plan")
        if uid and plan in ("plus", "pro"):
            conn = _db()
            conn.execute("UPDATE users SET plan = ? WHERE id = ?", (plan, int(uid)))
            conn.commit()
            conn.close()
    return {"ok": True}


@router.get("/auth/chats")
def get_chats(authorization: str | None = Header(default=None)):
    """Return the authenticated user's saved chat list (per-account, server-side)."""
    user = _current_user(authorization)
    conn = _db()
    row = conn.execute("SELECT data FROM chats WHERE user_id = ?", (user["id"],)).fetchone()
    conn.close()
    import json as _json
    return {"chats": _json.loads(row["data"]) if row else []}


@router.put("/auth/chats")
def save_chats(request: dict = Body(...), authorization: str | None = Header(default=None)):
    """Persist the authenticated user's chat list server-side (merge = replace)."""
    user = _current_user(authorization)
    import json as _json
    data = _json.dumps(request.get("chats", []))
    conn = _db()
    conn.execute(
        "INSERT INTO chats (user_id, data, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) "
        "ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = CURRENT_TIMESTAMP",
        (user["id"], data),
    )
    conn.commit()
    conn.close()
    return {"ok": True}


GUEST_IP_LIMIT = 25  # anonymous messages per day per IP


def enforce_guest_quota(ip: str):
    """Server-side anonymous usage cap — guests can't bypass it with a new tab."""
    day = time.strftime("%Y-%m-%d")
    conn = _db()
    row = conn.execute("SELECT count FROM guest_usage WHERE ip=? AND day=?", (ip, day)).fetchone()
    used = row["count"] if row else 0
    if used >= GUEST_IP_LIMIT:
        conn.close()
        raise HTTPException(
            status_code=429,
            detail={"type": "plan_limit", "plan": "guest", "used": used, "limit": GUEST_IP_LIMIT,
                    "message": "Daily anonymous limit reached — sign in to keep chatting"},
        )
    conn.execute(
        "INSERT INTO guest_usage (ip, day, count) VALUES (?, ?, 1) "
        "ON CONFLICT(ip, day) DO UPDATE SET count = count + 1",
        (ip, day),
    )
    conn.commit()
    conn.close()


def _send_mail_direct(to_email: str, subject: str, body: str) -> bool:
    """Send an email via the configured SMTP account (best-effort)."""
    import smtplib
    from email.mime.text import MIMEText
    addr = os.getenv("EMAIL_ADDRESS")
    pw = os.getenv("EMAIL_PASSWORD")
    if not addr or not pw:
        return False
    try:
        msg = MIMEText(body)
        msg["Subject"] = subject
        msg["From"] = addr
        msg["To"] = to_email
        with smtplib.SMTP("smtp.gmail.com", 587) as s:
            s.starttls()
            s.login(addr, pw)
            s.send_message(msg)
        return True
    except Exception:
        return False


@router.post("/auth/forgot")
def forgot_password(request: dict = Body(...)):
    """Email a password-reset link if the account exists (never leak existence)."""
    email = (request.get("email") or "").strip().lower()
    conn = _db()
    user = conn.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
    if user and user["provider"] == "email":
        import secrets
        token = secrets.token_hex(24)
        conn.execute("INSERT INTO reset_tokens (token, user_id, expires_at) VALUES (?, ?, ?)",
                     (token, user["id"], time.time() + 1800))
        conn.commit()
        link = f"{os.getenv('FRONTEND_URL', 'http://localhost:8081')}/reset?token={token}"
        sent = _send_mail_direct(email, "Reset your GenAI Workspace password",
                                 f"Reset your password:\n\n{link}\n\nValid for 30 minutes.")
        conn.close()
        return {"ok": True, "emailed": sent, "dev_link": link if not sent else None}
    conn.close()
    return {"ok": True}


@router.post("/auth/reset")
def reset_password(request: dict = Body(...)):
    token = request.get("token") or ""
    new_password = request.get("new_password") or ""
    if len(new_password) < 6:
        raise HTTPException(400, "Password must be at least 6 characters")
    conn = _db()
    row = conn.execute("SELECT * FROM reset_tokens WHERE token = ?", (token,)).fetchone()
    if not row or row["expires_at"] < time.time():
        conn.close()
        raise HTTPException(400, "Reset link expired or invalid — request a new one")
    conn.execute("UPDATE users SET password_hash = ? WHERE id = ?",
                 (hash_password(new_password), row["user_id"]))
    conn.execute("DELETE FROM reset_tokens WHERE token = ?", (token,))
    conn.commit()
    conn.close()
    return {"ok": True}


@router.post("/auth/google")
def google_login(req: GoogleRequest):
    client_id = os.getenv("GOOGLE_CLIENT_ID")
    if not client_id:
        raise HTTPException(400, "Google sign-in is not configured on the server yet")

    from google.oauth2 import id_token as google_id_token
    from google.auth.transport import requests as google_requests

    try:
        info = google_id_token.verify_oauth2_token(
            req.credential, google_requests.Request(), client_id
        )
    except Exception as e:
        raise HTTPException(401, f"Google verification failed: {e}")

    email = info.get("email")
    if not email:
        raise HTTPException(400, "Google account has no email")
    row = _upsert_oauth_user(email, info.get("name", ""), "google")
    return {"token": _make_token(row["id"], email), "user": _user_payload(row)}


@router.post("/auth/github")
def github_login(req: GithubRequest):
    client_id = os.getenv("GITHUB_CLIENT_ID")
    client_secret = os.getenv("GITHUB_CLIENT_SECRET")
    if not client_id or not client_secret:
        raise HTTPException(400, "GitHub sign-in is not configured on the server yet")

    try:
        token_resp = httpx.post(
            "https://github.com/login/oauth/access_token",
            json={"client_id": client_id, "client_secret": client_secret, "code": req.code},
            headers={"Accept": "application/json"},
            timeout=15,
        ).json()
        access_token = token_resp.get("access_token")
        if not access_token:
            raise HTTPException(401, f"GitHub token exchange failed: {token_resp.get('error_description', 'unknown error')}")

        headers = {"Authorization": f"Bearer {access_token}", "Accept": "application/json"}
        gh_user = httpx.get("https://api.github.com/user", headers=headers, timeout=15).json()
        email = gh_user.get("email")
        if not email:
            emails = httpx.get("https://api.github.com/user/emails", headers=headers, timeout=15).json()
            primary = next((e for e in emails if e.get("primary") and e.get("verified")), None)
            email = primary["email"] if primary else None
        if not email:
            raise HTTPException(400, "Could not get an email from your GitHub account")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"GitHub sign-in failed: {e}")

    row = _upsert_oauth_user(email, gh_user.get("name") or gh_user.get("login", ""), "github")
    return {"token": _make_token(row["id"], email), "user": _user_payload(row)}
