import os
import sys
import threading
import time
import subprocess
from datetime import datetime, timedelta

from fastapi import FastAPI, HTTPException, Request, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel

from backend.agent_executor import agent_executor
from backend.agent_executor import router as agent_router
from backend.auth import router as auth_router, get_optional_user, check_and_increment_quota
from backend.rag_pipeline import (
    answer_query,
    answer_query_search_mode,
    answer_query_agent_mode,
    stream_answer,
    resolve_tier,
    MODEL_TIERS,
    db as vector_db,
)

from apscheduler.schedulers.background import BackgroundScheduler
from backend.reminder_scheduler import scheduler as reminder_scheduler
import logging
import requests

# -----------------------
# Logging Configuration
# -----------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler("genai_workspace.log"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

# -----------------------
# FastAPI App
# -----------------------
app = FastAPI(
    title="GenAI Workspace API",
    description="Backend API for Assistant, Search, and Agent modes",
    version="1.0.0"
)
app.include_router(agent_router, prefix="/api")
app.include_router(auth_router)

# CORS Middleware — set ALLOWED_ORIGINS (comma-separated) in production
_allowed_origins = [o.strip() for o in os.getenv(
    "ALLOWED_ORIGINS",
    "http://localhost:8081,http://localhost:5173,http://127.0.0.1:8081,http://127.0.0.1:5173",
).split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

scheduler = BackgroundScheduler()
scheduler.start()

# -----------------------
# Scheduler Status
# -----------------------
scheduler_status = {
    "is_running": False,
    "last_sync": None,
    "next_sync": None,
    "sync_count": 0,
    "errors": []
}

# -----------------------
# Request Models
# -----------------------
class QueryRequest(BaseModel):
    query: str
    model: str | None = None  # 'auto' | 'lite' | 'smart' | 'pro'
    history: list[dict] | None = None  # recent turns for conversational memory

class PromptRequest(BaseModel):
    query: str

# -----------------------
# Utility Functions
# -----------------------
def send_email(subject: str, body: str, recipient: str):
    logger.info(f"[EMAIL] Subject: {subject}, To: {recipient}, Body: {body}")
    # Add actual email sending logic here


def send_webhook_notification(message: str):
    try:
        webhook_url = os.getenv("DISCORD_WEBHOOK_URL")
        if webhook_url:
            payload = {"content": message}
            response = requests.post(webhook_url, json=payload)
            if response.status_code != 204:
                logger.error(f"Discord webhook failed: {response.status_code}, {response.text}")
        else:
            logger.warning("DISCORD_WEBHOOK_URL not set in environment")
    except Exception as e:
        logger.error(f"Webhook notification error: {e}")


def _enforce_quota(request: Request):
    """Enforce the user's plan limit — or the anonymous per-IP cap for guests."""
    user = get_optional_user(request.headers.get("authorization"))
    if not user:
        from backend.auth import enforce_guest_quota
        enforce_guest_quota(request.client.host if request.client else "unknown")
        return None
    allowed, used, limit = check_and_increment_quota(user)
    if not allowed:
        raise HTTPException(
            status_code=429,
            detail={"type": "plan_limit", "plan": user["plan"], "used": used, "limit": limit,
                    "message": f"Daily limit of {limit} messages reached on the {user['plan'].title()} plan"},
        )
    return user


# -----------------------
# Endpoints
# -----------------------
def _tier_for(req_model: str | None, engine: str, query: str, request: Request) -> str:
    user = get_optional_user(request.headers.get("authorization"))
    return resolve_tier(req_model, engine, query, user["plan"] if user else "free")


def _scope_for(user) -> str:
    """Document namespace: each account sees public corpus + its own uploads."""
    return f"u{user['id']}" if user else "guest"


@app.post("/assistant")
async def assistant_endpoint(req: QueryRequest, request: Request):
    user = _enforce_quota(request)
    tier = _tier_for(req.model, "assistant", req.query, request)
    try:
        logger.info(f"Assistant request [{tier}]: {req.query}")
        result = answer_query(req.query, tier, _scope_for(user), req.history)
        return {"response": result, "model": MODEL_TIERS[tier], "tier": tier}
    except Exception as e:
        logger.error(f"Assistant error: {e}")
        return {"response": f"Assistant error: {str(e)}"}


@app.post("/search")
async def search_endpoint(req: QueryRequest, request: Request):
    user = _enforce_quota(request)
    tier = _tier_for(req.model, "search", req.query, request)
    try:
        logger.info(f"Search request [{tier}]: {req.query}")
        result = answer_query_search_mode(req.query, tier, _scope_for(user), req.history)
        return {"response": result, "model": MODEL_TIERS[tier], "tier": tier}
    except Exception as e:
        logger.error(f"Search error: {e}")
        return {"response": f"Search error: {str(e)}"}


@app.post("/assistant/stream")
async def assistant_stream(req: QueryRequest, request: Request):
    user = _enforce_quota(request)
    tier = _tier_for(req.model, "assistant", req.query, request)
    scope = _scope_for(user)
    import json as _json

    def gen():
        yield f"data: {_json.dumps({'meta': {'engine': 'assistant', 'tier': tier, 'model': MODEL_TIERS[tier]}})}\n\n"
        try:
            for chunk in stream_answer(req.query, "assistant", tier, scope, req.history):
                yield f"data: {_json.dumps({'delta': chunk})}\n\n"
        except Exception as e:
            logger.error(f"Assistant stream error: {e}")
            yield f"data: {_json.dumps({'error': str(e)})}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(gen(), media_type="text/event-stream")


@app.post("/search/stream")
async def search_stream(req: QueryRequest, request: Request):
    user = _enforce_quota(request)
    tier = _tier_for(req.model, "search", req.query, request)
    scope = _scope_for(user)
    import json as _json

    def gen():
        yield f"data: {_json.dumps({'meta': {'engine': 'search', 'tier': tier, 'model': MODEL_TIERS[tier]}})}\n\n"
        try:
            for chunk in stream_answer(req.query, "search", tier, scope, req.history):
                yield f"data: {_json.dumps({'delta': chunk})}\n\n"
        except Exception as e:
            logger.error(f"Search stream error: {e}")
            yield f"data: {_json.dumps({'error': str(e)})}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(gen(), media_type="text/event-stream")


@app.post("/upload", tags=["Documents"])
async def upload_document(request: Request, file: UploadFile = File(...)):
    """Upload a document → extract → chunk → index under the caller's owner scope."""
    user = get_optional_user(request.headers.get("authorization"))
    owner = _scope_for(user)  # 'u<id>' for accounts, 'guest' pool for anonymous uploads
    fname = file.filename or "upload.txt"
    ext = os.path.splitext(fname)[1].lower()
    if ext not in {".pdf", ".docx", ".txt", ".md", ".csv"}:
        raise HTTPException(400, f"Unsupported file type '{ext}' — use PDF, DOCX, TXT, MD or CSV")

    os.makedirs("data/uploads", exist_ok=True)
    dest = os.path.join("data/uploads", fname)
    content = await file.read()
    with open(dest, "wb") as f:
        f.write(content)

    try:
        from langchain_community.document_loaders import PyPDFLoader, Docx2txtLoader
        from langchain.schema import Document
        from langchain.text_splitter import RecursiveCharacterTextSplitter

        if ext == ".pdf":
            docs = PyPDFLoader(dest).load()
        elif ext == ".docx":
            docs = Docx2txtLoader(dest).load()
        else:
            docs = [Document(page_content=content.decode("utf-8", errors="replace"))]

        for d in docs:
            d.metadata["source"] = fname
            d.metadata["owner"] = owner

        splitter = RecursiveCharacterTextSplitter(chunk_size=1500, chunk_overlap=200)
        chunks = splitter.split_documents(docs)
        if not chunks:
            raise HTTPException(400, "No extractable text in this file")

        vector_db.add_documents(chunks)
        vector_db.save_local("faiss_index")

        # record owner so index rebuilds keep the tag (vector_store.py reads this)
        import json as _json
        manifest_path = "data/uploads/manifest.json"
        manifest = {}
        if os.path.exists(manifest_path):
            with open(manifest_path) as mf:
                manifest = _json.load(mf)
        manifest[fname] = owner
        with open(manifest_path, "w") as mf:
            _json.dump(manifest, mf)

        logger.info(f"Indexed upload '{fname}': {len(chunks)} chunks")
        return {"filename": fname, "chunks": len(chunks), "size": len(content)}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Upload failed for {fname}: {e}")
        raise HTTPException(500, f"Could not index this file: {e}")


@app.get("/documents", tags=["Documents"])
def list_documents():
    """List every document currently in the workspace corpus."""
    files = set()
    for folder in ("data/uploads", "data/sample_docs", "data/downloaded_docs"):
        if os.path.isdir(folder):
            for f in os.listdir(folder):
                if os.path.isfile(os.path.join(folder, f)) and f.lower().endswith(('.pdf', '.docx', '.txt', '.md', '.csv')):
                    files.add(f)
    return {"documents": sorted(files)}


@app.post("/agent/stream")
async def agent_stream(request: Request):
    """SSE agent endpoint — approval guard, status heartbeats, then the result."""
    user = _enforce_quota(request)
    from backend.agent_executor import get_agent
    import asyncio
    import json as _json

    data = await request.json()
    user_input = data.get("query")
    history = data.get("history") or []
    tier = _tier_for(data.get("model"), "agent", user_input or "", request)
    user_key = f"u{user['id']}" if user else "guest"

    # side-effecting actions → preview + approval card instead of executing
    if user_input and _ACTION_GUARD_RE.search(user_input):
        action = _parse_action(user_input, tier)
        if action:
            def pending_gen():
                yield f"data: {_json.dumps({'meta': {'engine': 'agent', 'tier': tier, 'model': MODEL_TIERS[tier]}})}\n\n"
                yield f"data: {_json.dumps({'pending': action})}\n\n"
                yield "data: [DONE]\n\n"
            return StreamingResponse(pending_gen(), media_type="text/event-stream")

    prompt_input = user_input
    if history:
        hist = "\n".join(
            f"{'User' if h.get('sender') == 'user' else 'Assistant'}: {str(h.get('text', ''))[:300]}"
            for h in history[-6:]
        )
        prompt_input = f"Recent conversation:\n{hist}\n\nLatest request: {user_input}"

    async def gen():
        yield f"data: {_json.dumps({'meta': {'engine': 'agent', 'tier': tier, 'model': MODEL_TIERS[tier]}})}\n\n"
        loop = asyncio.get_event_loop()
        future = loop.run_in_executor(None, get_agent(tier, user_key).run, prompt_input)
        steps = 0
        while not future.done():
            steps += 1
            status = "Choosing a tool…" if steps == 1 else ("Working on it…" if steps < 4 else "Almost done…")
            yield f"data: {_json.dumps({'status': status})}\n\n"
            await asyncio.sleep(1.2)
        try:
            result = future.result()
        except Exception as e:
            yield f"data: {_json.dumps({'error': str(e)})}\n\n"
            yield "data: [DONE]\n\n"
            return
        # emit the final answer in small deltas so it types in live
        text = str(result)
        step = 40
        for i in range(0, len(text), step):
            yield f"data: {_json.dumps({'delta': text[i:i+step]})}\n\n"
            await asyncio.sleep(0)
        yield "data: [DONE]\n\n"

    return StreamingResponse(gen(), media_type="text/event-stream")


# ---- Action approval guard ----
# Side-effecting actions (email / meetings) require explicit user approval.
import re as _re

_ACTION_GUARD_RE = _re.compile(
    r"\b(send|draft|compose)\b.{0,30}\b(e-?mails?|mail)\b|\be-?mail\b.{0,20}\bto\b.{0,80}@"
    r"|\b(schedule|book|set\s*up|arrange)\b.{0,30}\b(meetings?|call sync|sync call)\b",
    _re.I,
)


def _parse_action(query: str, tier: str):
    """LLM-extract a structured action preview for the approval card."""
    from backend.rag_pipeline import get_model
    import json as _j
    prompt = f'''Extract the user's intended action as ONE minified JSON object (no markdown).

Request: "{query}"

If they want an email sent: {{"kind":"email","to":"<recipient email>","subject":"<subject>","body":"<full body>"}}
If they want a meeting scheduled: {{"kind":"meeting","title":"<title or attendee>","when":"<date/time>","duration_minutes":<int>}}

JSON only.'''
    try:
        text = get_model(tier).generate_content(prompt).text
        m = _re.search(r"\{.*\}", text, _re.S)
        if m:
            a = _j.loads(m.group(0))
            if a.get("kind") in ("email", "meeting"):
                return a
    except Exception as e:
        logger.warning(f"Action parse failed: {e}")
    return None


class ConfirmRequest(BaseModel):
    action: dict


@app.post("/agent/confirm")
async def confirm_agent_action(req: ConfirmRequest):
    """Execute a previously previewed action after the user clicks Approve."""
    a = req.action or {}
    try:
        if a.get("kind") == "email":
            from backend.auth import _send_mail_direct
            ok = _send_mail_direct(a.get("to", ""), a.get("subject") or "(no subject)", a.get("body") or "")
            if ok:
                return {"ok": True, "message": f"✅ Email sent to {a.get('to')}"}
            return {"ok": False, "message": "❌ Email failed — check SMTP settings"}
        if a.get("kind") == "meeting":
            from backend.tools.scheduling_tool import schedule_meeting_from_prompt
            result = schedule_meeting_from_prompt(
                f"Schedule a meeting titled {a.get('title','meeting')} at {a.get('when','')} "
                f"for {a.get('duration_minutes', 30)} minutes"
            )
            return {"ok": True, "message": str(result)}
        return {"ok": False, "message": "Unknown action type"}
    except Exception as e:
        return {"ok": False, "message": f"❌ Failed: {e}"}


@app.post("/agent")
async def run_agent_task(request: Request):
    user = _enforce_quota(request)
    from backend.agent_executor import get_agent
    try:
        data = await request.json()
        user_input = data.get("query")
        history = data.get("history") or []
        tier = _tier_for(data.get("model"), "agent", user_input or "", request)
        user_key = f"u{user['id']}" if user else "guest"

        # side-effecting actions → preview + approval, don't execute
        if user_input and _ACTION_GUARD_RE.search(user_input):
            action = _parse_action(user_input, tier)
            if action:
                return {"pending": True, "action": action, "model": MODEL_TIERS[tier], "tier": tier}

        logger.info(f"Agent request [{tier}]: {user_input}")
        # give the agent the recent turns so follow-up commands resolve
        prompt_input = user_input
        if history:
            hist = "\n".join(
                f"{'User' if h.get('sender') == 'user' else 'Assistant'}: {str(h.get('text', ''))[:300]}"
                for h in history[-6:]
            )
            prompt_input = f"Recent conversation:\n{hist}\n\nLatest request: {user_input}"
        response = get_agent(tier, user_key).run(prompt_input)
        return {"response": response, "model": MODEL_TIERS[tier], "tier": tier}
    except Exception as e:
        logger.error(f"Agent error: {e}")
        return {"response": f"Agent error: {str(e)}"}


@app.get("/")
def root():
    return {"message": "GenAI Workspace API is running", "status": "healthy"}


@app.get("/health")
def health_check():
    return {"status": "healthy", "message": "GenAI Workspace API is running"}


@app.get("/scheduler/status")
def get_scheduler_status():
    return {
        "scheduler_active": scheduler_status["is_running"],
        "last_sync": scheduler_status["last_sync"],
        "next_sync": scheduler_status["next_sync"],
        "sync_count": scheduler_status["sync_count"],
        "recent_errors": scheduler_status["errors"][-5:],
        "faiss_index_exists": os.path.exists("faiss_index"),
        "current_time": datetime.now().isoformat()
    }


@app.get("/reminders")
def list_reminders():
    jobs = reminder_scheduler.get_jobs()
    return [
        {
            "id": job.id,
            "name": job.name,
            "next_run_time": job.next_run_time.isoformat() if job.next_run_time else None,
            "args": [str(a) for a in job.args],
        }
        for job in jobs
    ]


@app.get("/debug/routes")
def list_routes():
    routes = []
    for route in app.routes:
        if hasattr(route, 'methods') and hasattr(route, 'path'):
            routes.append({
                "path": route.path,
                "methods": list(route.methods),
                "name": getattr(route, 'name', 'unknown')
            })
    return {"routes": routes}


@app.get("/sync", tags=["System"])
def manual_sync():
    threading.Thread(target=run_scheduler_once, daemon=True).start()
    return {"message": "Manual sync started"}


# -----------------------
# Scheduler Functions
# -----------------------
def run_scheduler_once():
    current_time = datetime.now()
    logger.info(f"Starting sync at {current_time.strftime('%Y-%m-%d %H:%M:%S')}")

    try:
        logger.info("Syncing from Google Drive...")
        if os.path.exists("driveapi/sync_from_drive.py"):
            env = os.environ.copy()
            env['PYTHONIOENCODING'] = 'utf-8'

            result = subprocess.run(
                [sys.executable, "driveapi/sync_from_drive.py"],
                capture_output=True,
                text=True,
                check=True,
                env=env,
                encoding='utf-8'
            )
            logger.info("Google Drive sync completed")
            if result.stdout:
                logger.info(f"Output: {result.stdout.strip()}")
        else:
            logger.warning("Drive sync script not found, skipping...")
    except subprocess.CalledProcessError as e:
        msg = f"Drive sync failed: {e.stderr or str(e)}"
        logger.error(msg)
        scheduler_status["errors"].append(f"{current_time}: {msg}")
    except UnicodeDecodeError as e:
        msg = f"Drive sync encoding error: {str(e)}"
        logger.error(msg)
        scheduler_status["errors"].append(f"{current_time}: {msg}")

    try:
        logger.info("Rebuilding FAISS index...")
        if os.path.exists("backend/vector_store.py"):
            result = subprocess.run(
                [sys.executable, "backend/vector_store.py"],
                capture_output=True,
                text=True,
                check=True,
                encoding='utf-8'
            )
            logger.info("FAISS index rebuilt successfully")
            if result.stdout:
                logger.info(f"Output: {result.stdout.strip()}")
        else:
            logger.warning("Vector store script not found, skipping...")
    except subprocess.CalledProcessError as e:
        msg = f"FAISS rebuild failed: {e.stderr or str(e)}"
        logger.error(msg)
        scheduler_status["errors"].append(f"{current_time}: {msg}")

    scheduler_status["last_sync"] = current_time.isoformat()
    scheduler_status["sync_count"] += 1
    scheduler_status["next_sync"] = (current_time + timedelta(hours=24)).isoformat()

    logger.info(f"Sync #{scheduler_status['sync_count']} completed successfully")


def run_scheduler_forever():
    scheduler_status["is_running"] = True
    logger.info("Automatic scheduler started - syncing every 24 hours")

    run_scheduler_once()

    while scheduler_status["is_running"]:
        try:
            logger.info("Waiting 24 hours for next sync...")
            time.sleep(86400)  # 24 hours
            if scheduler_status["is_running"]:
                run_scheduler_once()
        except Exception as e:
            msg = f"Scheduler error: {str(e)}"
            logger.error(msg)
            scheduler_status["errors"].append(f"{datetime.now()}: {msg}")
            time.sleep(3600)


@app.on_event("startup")
async def startup_event():
    logger.info("GenAI Workspace API starting up...")

    if os.path.exists("faiss_index"):
        logger.info("FAISS index found")
    else:
        logger.warning("FAISS index not found - will be created on first sync")

    if os.path.exists("data/sample_docs"):
        logger.info("Data folder found")
    else:
        logger.warning("Data folder not found")

    logger.info("Starting background scheduler thread...")
    threading.Thread(target=run_scheduler_forever, daemon=True).start()

    # warm the vector index in the background — port binds instantly, first
    # request doesn't eat the HF model download + index build
    def _warm_index():
        try:
            from backend.rag_pipeline import db as _vdb
            _vdb.index.ntotal
            logger.info("Vector index warmed")
        except Exception as e:
            logger.warning(f"Index warm-up failed (will retry on first query): {e}")
    threading.Thread(target=_warm_index, daemon=True).start()

    scheduler_status["next_sync"] = (datetime.now() + timedelta(minutes=1)).isoformat()
    logger.info("Scheduler initialized")


# -----------------------
# Uvicorn CLI Entry
# -----------------------
if __name__ == "__main__":
    import uvicorn
    logger.info("Launching GenAI Workspace API with scheduler...")
    uvicorn.run(app, host="0.0.0.0", port=8000)