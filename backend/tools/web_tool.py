# =======================
# 4. web_tool.py (SerpAPI)
# =======================
import os
from serpapi import GoogleSearch
from dotenv import load_dotenv

load_dotenv()


def search_web(query: str) -> str:
    params = {
        "q": query,
        "api_key": os.getenv("SERPAPI_API_KEY"),
    }
    search = GoogleSearch(params)
    results = search.get_dict()
    return results['organic_results'][0]['snippet']
