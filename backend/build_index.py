import os
import pickle
from langchain_community.vectorstores import FAISS
from langchain_huggingface import HuggingFaceEmbeddings
from langchain.text_splitter import RecursiveCharacterTextSplitter
from load_documents import load_documents  # Assumes load_documents is updated

def build_faiss_index(output_folder="faiss_index"):
    # Load all documents
    print("📥 Loading documents...")
    documents = load_documents()

    if not documents:
        print("⚠️ No documents found. Index build aborted.")
        return

    # Split documents into chunks
    print("✂️ Splitting documents into chunks...")
    text_splitter = RecursiveCharacterTextSplitter(chunk_size=1500, chunk_overlap=200)
    split_docs = text_splitter.split_documents(documents)

    # Initialize embedding model
    print("🧠 Generating embeddings...")
    embeddings = HuggingFaceEmbeddings(model_name="sentence-transformers/all-MiniLM-L6-v2")

    # Create FAISS index
    print("📦 Creating FAISS index...")
    vectorstore = FAISS.from_documents(split_docs, embeddings)

    # Save index and store metadata
    os.makedirs(output_folder, exist_ok=True)
    vectorstore.save_local(output_folder)

    # Optionally save metadata for reference/debug
    metadata_path = os.path.join(output_folder, "doc_metadata.pkl")
    with open(metadata_path, "wb") as f:
        pickle.dump([doc.metadata for doc in split_docs], f)

    print(f"✅ FAISS index created and saved to '{output_folder}'")

if __name__ == "__main__":
    build_faiss_index()
