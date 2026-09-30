import re

def create_todo(text: str) -> str:
    # Example input: "Prepare demo by 2025-06-02"
    # Use regex to extract the date (deadline) in YYYY-MM-DD format
    date_match = re.search(r'(\d{4}-\d{2}-\d{2})', text)
    if date_match:
        deadline = date_match.group(1)
        # Remove "by <date>" part from text to get the task description
        task = re.sub(r'\s*by\s*\d{4}-\d{2}-\d{2}', '', text).strip()
    else:
        # No date found, set deadline to 'No deadline specified' or empty
        deadline = "No deadline specified"
        task = text.strip()

    with open("todo_list.txt", "a") as f:
        f.write(f"{task} | Deadline: {deadline}\n")
    return f"📝 Task '{task}' added to to-do list with deadline {deadline}."

def summarize_text(text: str) -> str:
    return f"📄 Summary: {text[:100]}..."
