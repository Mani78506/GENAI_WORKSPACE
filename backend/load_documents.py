import os
from langchain_community.document_loaders import PyPDFLoader, Docx2txtLoader, TextLoader

def load_documents(folder_path="data/sample_docs"):
    docs = []
    supported_exts = (".pdf", ".docx", ".txt")

    for file in os.listdir(folder_path):
        full_path = os.path.join(folder_path, file)
        if not os.path.isfile(full_path) or not file.lower().endswith(supported_exts):
            continue  # Skip non-files and unsupported types

        try:
            if file.lower().endswith(".pdf"):
                loaded = PyPDFLoader(full_path).load()
            elif file.lower().endswith(".docx"):
                loaded = Docx2txtLoader(full_path).load()
            elif file.lower().endswith(".txt"):
                loaded = TextLoader(full_path).load()
            else:
                continue

            # Tag the source file in metadata
            for doc in loaded:
                doc.metadata["source"] = file

            docs.extend(loaded)

        except Exception as e:
            print(f"❌ Failed to load {file}: {e}")

    print(f"📄 Loaded {len(docs)} documents from {folder_path}")
    return docs
