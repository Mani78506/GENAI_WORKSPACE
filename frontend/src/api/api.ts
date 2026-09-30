export async function sendAgentQuery(query: string): Promise<string> {
  const response = await fetch("http://localhost:8000/agent", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  });

  if (!response.ok) {
    throw new Error("Failed to get response from agent");
  }

  const data = await response.json();
  return data.response;
}
