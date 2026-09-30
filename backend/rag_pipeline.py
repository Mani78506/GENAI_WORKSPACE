from google import genai
import os
from langchain_community.vectorstores import FAISS
from langchain_huggingface import HuggingFaceEmbeddings
from langchain.prompts import PromptTemplate
from dotenv import load_dotenv
from backend.auth import PLAN_MAX_TIER
import logging

logger = logging.getLogger("genai_workspace.rag")


# Load environment variables
load_dotenv()

# -------- GEMINI KEY POOL -------- #
# One key = shared free-tier rate limit across ALL users. Provide a pool via
# GEMINI_API_KEYS="k1,k2,k3" — transient quota errors auto-rotate to the next key.
_API_KEYS = [
    k.strip()
    for k in (os.getenv("GEMINI_API_KEYS") or os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY") or "").split(",")
    if k.strip()
]
_key_pool: dict = {"idx": 0, "clients": {}}


def get_gemini_key() -> str | None:
    """Current Gemini API key from the pool (agent LLM reads this too)."""
    return _API_KEYS[_key_pool["idx"]] if _API_KEYS else None


def _rotate_key():
    if len(_API_KEYS) > 1:
        _key_pool["idx"] = (_key_pool["idx"] + 1) % len(_API_KEYS)
        logger.info(f"Gemini key rotated → #{_key_pool['idx'] + 1}/{len(_API_KEYS)}")


def _pool_client():
    key = get_gemini_key()
    if key not in _key_pool["clients"]:
        _key_pool["clients"][key] = genai.Client(api_key=key)
    return _key_pool["clients"][key]


def _is_quota_error(e: Exception) -> bool:
    return any(code in str(e) for code in ("503", "429", "UNAVAILABLE", "RESOURCE_EXHAUSTED"))


class _GeminiModel:
    """Drop-in replacement for the deprecated google.generativeai GenerativeModel."""
    def __init__(self, model: str):
        self.model = model

    def generate_content(self, contents: str):
        import time
        last_err = None
        attempts = 4 + len(_API_KEYS)
        for attempt in range(attempts):
            try:
                return _pool_client().models.generate_content(model=self.model, contents=contents)
            except Exception as e:
                last_err = e
                if _is_quota_error(e):
                    _rotate_key()  # try the next project's quota before sleeping
                    time.sleep(min(2 * (attempt + 1), 6))
                    continue
                raise
        raise last_err

    def generate_content_stream(self, contents: str):
        import time
        last_err = None
        attempts = 4 + len(_API_KEYS)
        for attempt in range(attempts):
            try:
                for chunk in _pool_client().models.generate_content_stream(model=self.model, contents=contents):
                    if chunk.text:
                        yield chunk.text
                return
            except Exception as e:
                last_err = e
                if _is_quota_error(e):
                    _rotate_key()
                    time.sleep(min(2 * (attempt + 1), 6))
                    continue
                raise
        raise last_err

gemini = _GeminiModel("gemini-3.1-flash-lite")

# -------- MODEL TIERS -------- #
# Selectable quality tiers — map to real models available on this key
MODEL_TIERS = {
    "lite": "gemini-3.1-flash-lite",   # ⚡ Fast — cheap, instant
    "smart": "gemini-3.5-flash",       # 🧠 Smart — better reasoning
    "pro": "gemini-3.1-pro-preview",   # 🚀 Pro — strongest available
}
_model_cache: dict = {"gemini-3.1-flash-lite": gemini}


def get_model(tier: str):
    name = MODEL_TIERS.get(tier, MODEL_TIERS["lite"])
    if name not in _model_cache:
        _model_cache[name] = _GeminiModel(name)
    return _model_cache[name]


def auto_tier(query: str, engine: str) -> str:
    """'auto' routing: agentic tasks need reasoning, casual chat stays cheap."""
    if engine == "agent":
        return "smart"
    if is_casual_or_general_query(query):
        return "lite"
    return "smart"


def resolve_tier(requested: str | None, engine: str, query: str, plan: str | None) -> str:
    """Resolve the user's requested tier within their plan's cap. Returns a tier key."""
    order = ["lite", "smart", "pro"]
    if not requested or requested == "auto":
        t = auto_tier(query, engine)
    elif requested in MODEL_TIERS:
        t = requested
    else:
        t = "lite"
    cap = PLAN_MAX_TIER.get(plan or "free", "smart")
    return t if order.index(t) <= order.index(cap) else cap

# FAISS loads LAZILY on first use — the HF model download + index build must not
# block uvicorn from binding its port (Render kills slow-to-bind services).
EMBED_MODEL = None


def _embeddings():
    global EMBED_MODEL
    if EMBED_MODEL is None:
        EMBED_MODEL = HuggingFaceEmbeddings(model_name="sentence-transformers/all-MiniLM-L6-v2")
    return EMBED_MODEL


def _load_or_build_db():
    try:
        return FAISS.load_local("faiss_index", _embeddings(), allow_dangerous_deserialization=True)
    except Exception as e:
        logger.warning(f"No local FAISS index ({e}) — building from sample_docs + uploads")
    try:
        from backend.load_documents import load_documents
        from langchain.text_splitter import RecursiveCharacterTextSplitter
        import json as _j

        docs = load_documents("data/sample_docs") if os.path.isdir("data/sample_docs") else []
        for d in docs:
            d.metadata.setdefault("owner", "public")
        manifest = {}
        if os.path.isdir("data/uploads"):
            if os.path.exists("data/uploads/manifest.json"):
                with open("data/uploads/manifest.json") as mf:
                    manifest = _j.load(mf)
            ups = load_documents("data/uploads")
            for d in ups:
                d.metadata["owner"] = manifest.get(d.metadata.get("source", ""), "guest")
            docs.extend(ups)

        if docs:
            chunks = RecursiveCharacterTextSplitter(chunk_size=1500, chunk_overlap=200).split_documents(docs)
            store = FAISS.from_documents(chunks, _embeddings())
            store.save_local("faiss_index")
            logger.info(f"FAISS built at boot: {len(chunks)} chunks")
            return store
    except Exception as e:
        logger.error(f"FAISS boot-build failed: {e}")
    # last resort: empty store so uploads/queries don't crash
    return FAISS.from_texts(["GenAI Workspace corpus"], _embeddings())


class _LazyFAISS:
    """Transparent proxy — the real store builds on first access, not at import."""
    _inst = None

    def _get(self):
        if self._inst is None:
            self._inst = _load_or_build_db()
        return self._inst

    def __getattr__(self, name):
        return getattr(self._get(), name)


db = _LazyFAISS()

# -------- PROMPTS WITH STRUCTURED GUIDANCE -------- #
# Prompt for point-wise summaries
point_wise_prompt = PromptTemplate(
    input_variables=["context", "query"],
    template="""
Please provide a clear, concise point-wise summary or explanation for the following:

Context: {context}

Question: {query}

Points:
1.
2.
3.
...
"""
)

# Prompt for step-by-step explanations
step_by_step_prompt = PromptTemplate(
    input_variables=["context", "query"],
    template="""
Explain the following in a step-by-step manner, numbering each step clearly:

Context: {context}

Question: {query}

Steps:
1.
2.
3.
...
"""
)

# Prompt for extracting key points
key_points_prompt = PromptTemplate(
    input_variables=["context", "query"],
    template="""
Extract the key points from the following context relevant to the question. Present each point as a separate item:

Context: {context}

Question: {query}

Key Points:
- 
- 
- 
...
"""
)

# General assistant prompt with structured response
assistant_prompt = PromptTemplate(
    input_variables=["context", "query"],
    template="""
You are a helpful assistant. Use the context below to answer the question if relevant, and present the information in a structured, point-wise format for clarity.

Context: {context}

Question: {query}

"""
)

# Search-specific prompt
search_prompt = PromptTemplate(
    input_variables=["context", "query"],
    template="""
You are a document search assistant. If the user asks casually, respond naturally. For document-related queries, use the context below to provide a structured, point-wise answer.

Context: {context}

Question: {query}


"""
)

# Agent prompt for complex interactions
agent_prompt = PromptTemplate(
    input_variables=["context", "query"],
    template="""
You are GenAI Agent — a smart enterprise agent. Respond naturally, and organize your answer in a clear, structured manner, using points, steps, or sections as needed.

Context: {context}

User: {query}

Response:
 **Introduction** (if applicable)
 **Main Points or Steps**:
   - Point/Step 1: Description
   - Point/Step 2: Description
   - ...
 **Summary or Final Remarks**
"""
)

# -------- UTILITY TO FORMAT SOURCES -------- #
def format_sources(docs):
    """Returns a formatted string of document sources"""
    if not docs:
        return ""
    seen = set()
    source_list = []
    for doc in docs:
        source = doc.metadata.get("source", "Unknown source")
        if source not in seen:
            seen.add(source)
            source_list.append(f"- {source}")
    return "\n📚 Sources:\n" + "\n".join(source_list)

# -------- UTILITY TO CHECK IF QUERY IS CASUAL OR GENERAL -------- #
def is_casual_or_general_query(query: str) -> bool:
    casual_patterns = [
        "hi", "hello", "hey", "good morning", "good afternoon", "good evening",
        "how are you", "what's up", "thanks", "thank you", "bye", "goodbye",
        "what can you do", "help me", "who are you", "what are you"
    ]
    query_lower = query.lower().strip()
    return any(pattern in query_lower for pattern in casual_patterns) or len(query_lower.split()) <= 3

# -------- IMPROVED RELEVANCE CHECK -------- #
def is_document_relevant(query: str, docs, min_word_overlap: float = 0.15) -> tuple:
    """
    Checks if docs are relevant based on flexible criteria
    """
    if not docs:
        return False, []

    query_lower = query.lower()
    stop_words = {'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'can', 'what', 'how', 'when', 'where', 'why', 'who'}
    query_words = set(word.strip('.,!?;:') for word in query_lower.split() if len(word) > 2 and word not in stop_words)

    if not query_words:
        return False, []

    relevant_docs = []

    for doc in docs:
        content_lower = doc.page_content.lower()
        content_words = set(content_lower.split())

        overlap = len(query_words.intersection(content_words))
        overlap_ratio = overlap / len(query_words) if query_words else 0

        is_doc_relevant = (
            overlap_ratio >= min_word_overlap or
            overlap >= 2 or
            any(word in content_lower for word in query_words if len(word) > 4)
        )

        if is_doc_relevant:
            relevant_docs.append(doc)

    is_relevant = len(relevant_docs) > 0
    return is_relevant, relevant_docs

# -------- IMPROVED SIMILARITY SEARCH WITH BETTER FILTERING -------- #
def get_relevant_documents(query: str, k: int = 8, scope: str | None = None):
    """Retrieve relevant documents, scoped: public corpus + this owner's uploads."""
    try:
        fetch_k = k * 4 if scope else k
        docs_with_scores = db.similarity_search_with_score(query, k=fetch_k)
        if scope:
            docs_with_scores = [
                (d, s) for d, s in docs_with_scores
                if d.metadata.get("owner", "public") in ("public", scope)
            ][:k]

        if not docs_with_scores:
            return []

        best_score = docs_with_scores[0][1]
        filtered_docs = []

        for doc, score in docs_with_scores:
            if score <= best_score + 0.5:  # Increased threshold
                filtered_docs.append(doc)

        is_relevant, relevant_docs = is_document_relevant(query, filtered_docs, min_word_overlap=0.1)

        if not relevant_docs and filtered_docs:
            print(f"⚠️ No docs passed relevance check, using top {min(3, len(filtered_docs))} similarity matches")
            return filtered_docs[:3]

        return relevant_docs

    except Exception as e:
        print(f"Error in similarity search: {e}")
        docs = db.similarity_search(query, k=k)
        is_relevant, relevant_docs = is_document_relevant(query, docs, min_word_overlap=0.1)
        return relevant_docs if relevant_docs else docs[:3]

# -------- POLICY-SPECIFIC SEARCH -------- #
def _history_block(history: list | None) -> str:
    """Format recent turns so follow-ups ('and what about X?') resolve correctly."""
    if not history:
        return ""
    lines = []
    for h in history[-8:]:
        role = "User" if h.get("sender") == "user" else "Assistant"
        lines.append(f"{role}: {str(h.get('text', ''))[:500]}")
    return "Conversation so far:\n" + "\n".join(lines) + "\n\n"


def search_all_policies(query: str, k: int = 10, scope: str | None = None):
    """Search policy documents, scoped: public docs + this owner's uploads only."""
    try:
        # over-fetch then post-filter by owner metadata (missing owner = public corpus)
        fetch_k = k * 4 if scope else k
        docs_with_scores = db.similarity_search_with_score(query, k=fetch_k)
        if scope:
            docs_with_scores = [
                (d, s) for d, s in docs_with_scores
                if d.metadata.get("owner", "public") in ("public", scope)
            ][:k]
        if not docs_with_scores:
            return []

        # Group by source for diversity
        docs_by_source = {}
        for doc, score in docs_with_scores:
            source = doc.metadata.get("source", "unknown")
            if source not in docs_by_source:
                docs_by_source[source] = []
            docs_by_source[source].append((doc, score))

        # Take top docs from each source
        diverse_docs = []
        for source, source_docs in docs_by_source.items():
            source_docs.sort(key=lambda x: x[1])  # sort by score
            diverse_docs.extend([doc for doc, score in source_docs[:2]])

        is_relevant, relevant_docs = is_document_relevant(query, diverse_docs, min_word_overlap=0.1)
        return relevant_docs if relevant_docs else diverse_docs[:5]

    except Exception as e:
        print(f"Error in policy search: {e}")
        return []

# -------- RESPONSE FUNCTIONS USING STRUCTURED PROMPTS -------- #
def _build_assistant(query: str, scope: str | None = None, history: list | None = None) -> tuple[str, str]:
    """Returns (prompt, sources_suffix)."""
    if is_casual_or_general_query(query) and not history:
        return assistant_prompt.format(context="No specific context needed for casual interaction.", query=query), ""
    relevant_docs = get_relevant_documents(query, k=6, scope=scope)
    ctx = _history_block(history) + (
        "\n\n".join(d.page_content for d in relevant_docs)
        if relevant_docs else "No relevant documents found."
    )
    return assistant_prompt.format(context=ctx, query=query), (format_sources(relevant_docs) if relevant_docs else "")


def _build_search(query: str, scope: str | None = None, history: list | None = None) -> tuple[str | None, str]:
    """Returns (prompt, sources_suffix) or (None, '') when nothing matches."""
    if is_casual_or_general_query(query) and not history:
        return search_prompt.format(context="No specific context needed for casual interaction.", query=query), ""
    relevant_docs = search_all_policies(query, k=10, scope=scope)
    if relevant_docs:
        context = _history_block(history) + "\n\n".join(d.page_content for d in relevant_docs)
        return search_prompt.format(context=context, query=query), format_sources(relevant_docs)
    return None, ""


def answer_query(query: str, tier: str = "lite", scope: str | None = None, history: list | None = None) -> str:
    prompt, suffix = _build_assistant(query, scope, history)
    answer = get_model(tier).generate_content(prompt).text.strip()
    return f"{answer}\n\n{suffix}" if suffix else answer


def answer_query_search_mode(query: str, tier: str = "lite", scope: str | None = None, history: list | None = None) -> str:
    prompt, suffix = _build_search(query, scope, history)
    if prompt is None:
        return "No relevant information found in the documents. Feel free to ask me something else or try a different search term!"
    answer = get_model(tier).generate_content(prompt).text.strip()
    return f"{answer}\n\n{suffix}" if suffix else answer


def stream_answer(query: str, mode: str, tier: str = "lite", scope: str | None = None, history: list | None = None):
    """Generator yielding text chunks for SSE streaming (assistant or search mode)."""
    prompt, suffix = (_build_assistant if mode == 'assistant' else _build_search)(query, scope, history)
    if prompt is None:
        yield "No relevant information found in the documents. Feel free to ask me something else or try a different search term!"
        return
    for chunk in get_model(tier).generate_content_stream(prompt):
        yield chunk
    if suffix:
        yield f"\n\n{suffix}"

def answer_query_agent_mode(query: str, tier: str = "smart", scope: str | None = None, history: list | None = None) -> str:
    model = get_model(tier)
    if is_casual_or_general_query(query) and not history:
        prompt = agent_prompt.format(context="General conversation context.", query=query)
        return model.generate_content(prompt).text.strip()

    relevant_docs = search_all_policies(query, k=8, scope=scope)
    if relevant_docs:
        context = _history_block(history) + "\n\n".join([d.page_content for d in relevant_docs])
    else:
        context = _history_block(history) + "No specific document context available."

    prompt = agent_prompt.format(context=context, query=query)
    answer = model.generate_content(prompt).text.strip()
    return answer

# -------- DEBUG FUNCTION -------- #
def debug_query_relevance(query: str):
    """Debug the document retrieval and relevance filtering"""
    print(f"🔍 Debugging query: '{query}'")
    docs = db.similarity_search_with_score(query, k=10)
    print(f"📄 Basic search found: {len(docs)} documents")
    docs_by_source = {}
    for doc, score in docs:
        source = doc.metadata.get('source', 'Unknown')
        if source not in docs_by_source:
            docs_by_source[source] = []
        docs_by_source[source].append((doc, score))
    print(f"📚 Documents by source:")
    for source, source_docs in docs_by_source.items():
        print(f"  {source}: {len(source_docs)} documents")
        for i, (doc, score) in enumerate(source_docs[:2]):
            print(f"    Doc {i+1}: Score {score:.3f}")
    # Relevance filtering
    docs_only = [doc for doc, score in docs]
    is_relevant, relevant_docs = is_document_relevant(query, docs_only)
    print(f"🎯 Relevant documents after filtering: {len(relevant_docs)}")
    print(f"✅ Is relevant: {is_relevant}")
    if relevant_docs:
        relevant_sources = set(doc.metadata.get('source', 'Unknown') for doc in relevant_docs)
        print(f"📋 Sources in final results: {relevant_sources}")
        
def rag_answer(query: str) -> str:
    docs = db.similarity_search(query, k=3)
    context = "\n".join([doc.page_content for doc in docs])
    answer = gemini.generate_content(f"{context}\n\nQuestion: {query}")
    # Add citations
    sources = [doc.metadata.get("source", "Unknown") for doc in docs]
    citations = "\n".join([f"[{i+1}] {src}" for i, src in enumerate(sources)])
    return f"{answer.text}\n\nSources:\n{citations}"