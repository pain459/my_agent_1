from ollama import Client
from pydantic import BaseModel

# 1. Initialize client to point to the Dockerized Ollama
client = Client(host='http://localhost:11435')

class AgentResponse(BaseModel):
    thought_process: str
    action_decision: str
    confidence_score: float

def run_agent(user_prompt: str) -> AgentResponse:
    print(f"Sending prompt to local agent: '{user_prompt}'\n")
    
    # 2. Use the custom client instead of the global chat function
    response = client.chat(
        model='llama3.1',
        messages=[
            {
                'role': 'system', 
                'content': 'You are a logical AI agent. Analyze the user request, explain your thought process, and decide on a single action to take. Keep thoughts concise.'
            },
            {
                'role': 'user', 
                'content': user_prompt
            }
        ],
        format=AgentResponse.model_json_schema(),
        options={'temperature': 0.1}
    )
    
    structured_output = AgentResponse.model_validate_json(response.message.content)
    return structured_output

if __name__ == "__main__":
    prompt = "I have a CSV file with customer data and I need to find the average age."
    result = run_agent(prompt)
    
    print("--- VALIDATED OUTPUT ---")
    print(f"Thoughts: {result.thought_process}")
    print(f"Action:   {result.action_decision}")
    print(f"Score:    {result.confidence_score}")