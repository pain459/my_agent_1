import json
from pydantic import BaseModel, Field
from typing import Optional, Literal
from memory_manager import AgentMemory, ollama_client
from tools import AVAILABLE_TOOLS

# 1. Update our structured output schema to handle tool choices
class AgentActionSchema(BaseModel):
    thought_process: str = Field(description="Internal reasoning before making a decision.")
    choose_action: Literal["call_tool", "reply_to_user"] = Field(description="Decide whether to execute a tool or answer directly.")
    tool_name: Optional[Literal["get_system_metrics", "write_to_file"]] = Field(default=None, description="The tool to execute if calling a tool.")
    tool_arguments: Optional[str] = Field(default=None, description="JSON string of arguments for the tool (e.g., '{\"filename\": \"test.txt\", \"content\": \"hello\"}')")
    final_reply: Optional[str] = Field(default=None, description="The direct response to the user if no tool is needed.")

class AgentExecutor:
    def __init__(self):
        self.memory = AgentMemory()

    def run(self, user_prompt: str):
        print(f"\n🚀 [User Prompt]: {user_prompt}")

        # Step A: Retrieve relevant long-term semantic rules/memories (RAG)
        rag_results = self.memory.query_semantic_knowledge(user_prompt, n_results=1)
        retrieved_context = ""
        if rag_results and rag_results['documents'] and rag_results['documents'][0]:
            retrieved_context = rag_results['documents'][0][0]
            print(f"🧠 [Retrieved Context]: {retrieved_context}")

        # Step B: Prepare System Prompt with Context and Tool Guidelines
        system_prompt = f"""You are a smart operations agent.
Context from long-term memory: {retrieved_context}

Available Tools:
1. get_system_metrics: No parameters needed. Returns CPU and memory metrics.
2. write_to_file: Expects 'filename' and 'content' strings.

Instructions:
- If the user asks for information requiring a tool, set choose_action to 'call_tool', specify tool_name, and provide tool_arguments as a raw valid JSON string.
- If you have enough info to answer, set choose_action to 'reply_to_user' and populate 'final_reply'.
"""

        # Step C: Ask LLM for the Next Action
        response = ollama_client.chat(
            model='llama3.1',
            messages=[
                {'role': 'system', 'content': system_prompt},
                {'role': 'user', 'content': user_prompt}
            ],
            format=AgentActionSchema.model_json_schema(),
            options={'temperature': 0.1}
        )

        decision = AgentActionSchema.model_validate_json(response.message.content)
        print(f"🤔 [Thoughts]: {decision.thought_process}")

        # Step D: Execute Tool if requested
        if decision.choose_action == "call_tool" and decision.tool_name:
            tool_name = decision.tool_name
            print(f"🛠️  [Executing Tool]: {tool_name} with args: {decision.tool_arguments}")
            
            # Parse arguments and run the local function
            args = json.loads(decision.tool_arguments) if decision.tool_arguments else {}
            tool_function = AVAILABLE_TOOLS[tool_name]
            
            # Execute the python function dynamically
            if tool_name == "get_system_metrics":
                tool_output = tool_function()
            elif tool_name == "write_to_file":
                tool_output = tool_function(filename=args.get("filename"), content=args.get("content"))

            print(f"📊 [Tool Output]: {tool_output}")

            # Step E: Give the tool results back to the LLM for a final summary
            final_response = ollama_client.chat(
                model='llama3.1',
                messages=[
                    {'role': 'system', 'content': system_prompt},
                    {'role': 'user', 'content': user_prompt},
                    {'role': 'assistant', 'content': response.message.content},
                    {'role': 'user', 'content': f"Tool execution result: {tool_output}. Synthesize the final response."}
                ]
            )
            output_text = final_response.message.content
            print(f"✨ [Final Response]: {output_text}")
            
            # Log full episode to SQLite
            self.memory.add_episodic_log(user_prompt, decision.thought_process, f"{tool_name}_executed", 1.0)
            
        else:
            # Direct response case
            output_text = decision.final_reply
            print(f"✨ [Final Response]: {output_text}")
            self.memory.add_episodic_log(user_prompt, decision.thought_process, "direct_reply", 1.0)

if __name__ == "__main__":
    executor = AgentExecutor()
    
    # Test execution that forces tool use
    executor.run("Can you check the current system resource usage metrics?")