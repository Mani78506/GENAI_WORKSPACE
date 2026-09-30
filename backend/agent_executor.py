# backend/tools/agent_executor.py
from fastapi import APIRouter
from pydantic import BaseModel
from backend.tools.task_flow_engine import task_flow_engine
import json
from langchain.agents import initialize_agent, Tool, AgentType
from langchain.memory import ConversationBufferMemory
from langchain_google_genai import ChatGoogleGenerativeAI
from backend.rag_pipeline import rag_answer
from backend.tools.calendar_tool import schedule_meeting
from backend.tools.email_tool import send_email
from backend.tools.task_tools import create_todo, summarize_text
from backend.tools.web_tool import search_web
from langchain.agents import Tool
from backend.tools.scheduling_tool import schedule_meeting_from_prompt
from backend.reminder_scheduler import schedule_reminder
from datetime import datetime

llm = ChatGoogleGenerativeAI(model="gemini-3.1-flash-lite", transport="rest")
memory = ConversationBufferMemory(memory_key="chat_history", return_messages=True)

# Per-tier LLM factory — agent reasoning quality follows the selected model tier
from backend.rag_pipeline import MODEL_TIERS, get_gemini_key

_agents: dict = {}


def get_agent(tier: str = "smart", user_key: str = "guest"):
    """Return an agent executor scoped to (tier, user) — memory never crosses accounts."""
    tier = tier if tier in MODEL_TIERS else "smart"
    key = (tier, user_key)
    if key not in _agents:
        tier_llm = ChatGoogleGenerativeAI(model=MODEL_TIERS[tier], transport="rest", google_api_key=get_gemini_key())
        _agents[key] = initialize_agent(
            tools=tools,
            llm=tier_llm,
            agent=AgentType.CONVERSATIONAL_REACT_DESCRIPTION,
            memory=ConversationBufferMemory(memory_key="chat_history", return_messages=True),
            verbose=True,
        )
    return _agents[key]

router = APIRouter()

class AgentTaskRequest(BaseModel):
    user_input: str

@router.post("/agent/task")
async def run_agent_task(request: AgentTaskRequest):
    result = task_flow_engine(request.user_input)
    return {"result": result}

@router.get("/agent/tasks/logs")
def get_agent_logs():
    try:
        with open("agent_tasks_log.json", "r") as f:
            logs = json.load(f)
        return {"logs": logs}
    except FileNotFoundError:
        return {"logs": []}


tools = [
    Tool(
        name="RAGAnswer",
        func=rag_answer,
        description="Answer questions using internal documents and retrieval. Example: 'What is our refund policy?'"
    ),
    Tool(
        name="ScheduleMeeting",
        func=schedule_meeting_from_prompt,
        description="Schedules a meeting based on a natural language prompt. Example: 'Schedule a meeting titled Team Sync tomorrow at 3 PM for 45 minutes.'"
    ),
    Tool(
        name="SendEmail",
        func=send_email,
        description="Send an email. Example: 'Send an email to Alice saying project is approved.'"
    ),
    Tool(
        name="CreateTodo",
        func=create_todo,
        description="Create a to-do item. Example: 'Add a task to prepare for the review tomorrow.'"
    ),
    Tool(
        name="SummarizeText",
        func=summarize_text,
        description="Summarize long paragraphs. Example: 'Summarize this article about generative AI.'"
    ),
    Tool(
        name="SearchWeb",
        func=search_web,
        description="Search the web. Example: 'Search the web for the latest AI tools.'"
    )
]
# Parse the user query into reminder text + time
reminder_text = "Check the report"
reminder_time = datetime(2025, 6, 2, 17, 0)  # 5 PM

agent_executor = initialize_agent(
    tools=tools,
    llm=llm,
    agent=AgentType.CONVERSATIONAL_REACT_DESCRIPTION,
    memory=memory,
    verbose=True
)
_agents[("lite", "guest")] = agent_executor
schedule_reminder(agent=agent_executor, reminder_text=reminder_text, run_at=reminder_time)


