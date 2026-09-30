from langchain_community.vectorstores import FAISS
from langchain_huggingface import HuggingFaceEmbeddings
from load_documents import load_documents

from dotenv import load_dotenv
import os

load_dotenv()

def create_faiss_index(folder_path="data/sample_docs"):
    documents = load_documents(folder_path)
    for doc in documents:
        doc.metadata.setdefault("owner", "public")

    # Merge user uploads, preserving per-owner tags from the manifest
    import json as _json
    manifest_path = "data/uploads/manifest.json"
    if os.path.isdir("data/uploads"):
        manifest = {}
        if os.path.exists(manifest_path):
            with open(manifest_path) as f:
                manifest = _json.load(f)
        uploads = load_documents("data/uploads")
        for doc in uploads:
            src = doc.metadata.get("source", "")
            doc.metadata["owner"] = manifest.get(src, "guest")
        documents.extend(uploads)

    if not documents:
        print("⚠️ No documents found. Check your data/sample_docs folder.")
        return
    embeddings = HuggingFaceEmbeddings(model_name="sentence-transformers/all-MiniLM-L6-v2")
    db = FAISS.from_documents(documents, embeddings)
    db.save_local("faiss_index")