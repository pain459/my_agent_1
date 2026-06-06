import os
import sqlite3
import json
from datetime import datetime
from ollama import Client
import chromadb
from chromadb.config import Settings

# Initialize the Ollama client pointing to your specific setup
# Update port to 11434 if you reverted to host, or keep 11435 for Docker
OLLAMA_HOST = 'http://localhost:11435'
ollama_client = Client(host=OLLAMA_HOST)

class AgentMemory:
    def __init__(self, db_folder="./memory_store"):
        os.makedirs(db_folder, exist_ok=True)
        
        # 1. Initialize Episodic Memory (SQLite)
        self.sqlite_path = os.path.join(db_folder, "episodic_memory.db")
        self._init_sqlite()
        
        # 2. Initialize Semantic Memory (ChromaDB Vector Store)
        # Using a persistent local client
        self.chroma_client = chromadb.PersistentClient(
            path=os.path.join(db_folder, "chroma_semantic")
        )
        # Create or get a collection for learned rules/facts
        self.collection = self.chroma_client.get_or_create_collection(
            name="agent_knowledge"
        )

    def _init_sqlite(self):
        """Creates the episodic conversation log table if it doesn't exist."""
        with sqlite3.connect(self.sqlite_path) as conn:
            cursor = conn.cursor()
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS conversation_logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp TEXT,
                    user_prompt TEXT,
                    agent_thoughts TEXT,
                    agent_action TEXT,
                    confidence REAL
                )
            """)
            conn.commit()

    def get_ollama_embedding(self, text: str):
        """Generates a vector embedding using the local Ollama instance."""
        response = ollama_client.embeddings(
            model="nomic-embed-text",
            prompt=text
        )
        return response["embedding"]

    def add_episodic_log(self, user_prompt: str, thoughts: str, action: str, confidence: float):
        """Logs a raw interaction sequence into SQLite."""
        timestamp = datetime.utcnow().isoformat()
        with sqlite3.connect(self.sqlite_path) as conn:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO conversation_logs (timestamp, user_prompt, agent_thoughts, agent_action, confidence)
                VALUES (?, ?, ?, ?, ?)
            """, (timestamp, user_prompt, thoughts, action, confidence))
            conn.commit()
        print(f" Saved episode to SQLite.")

    def add_semantic_knowledge(self, knowledge_id: str, text_content: str, metadata: dict = None):
        """Embeds text and stores it in the local vector database."""
        embedding = self.get_ollama_embedding(text_content)
        
        self.collection.add(
            ids=[knowledge_id],
            embeddings=[embedding],
            documents=[text_content],
            metadatas=[metadata or {}]
        )
        print(f" Embedded and saved semantic knowledge: '{knowledge_id}'")

    def query_semantic_knowledge(self, query_text: str, n_results: int = 2):
        """Searches vector space for relevant past concepts or rules."""
        query_embedding = self.get_ollama_embedding(query_text)
        
        results = self.collection.query(
            query_embeddings=[query_embedding],
            n_results=n_results
        )
        return results

# --- Verification & Testing ---
if __name__ == "__main__":
    # Test the layer isolation
    memory = AgentMemory()
    
    print("\n--- Testing Episodic Logging ---")
    memory.add_episodic_log(
        user_prompt="How do I calculate average age in pandas?",
        thoughts="User needs a pandas snippet. I will provide df['age'].mean().",
        action="provide_code_snippet",
        confidence=0.95
    )
    
    print("\n--- Testing Semantic Embedding and Storage ---")
    # Seed some explicit knowledge/rules the agent should recall later
    memory.add_semantic_knowledge(
        knowledge_id="rule_01",
        text_content="Always write infrastructure code using clean Python 3.11 features like advanced type hinting.",
        metadata={"category": "coding_standard"}
    )
    memory.add_semantic_knowledge(
        knowledge_id="rule_02",
        text_content="When handling database connections, always wrap them in context managers to prevent leaks.",
        metadata={"category": "best_practice"}
    )
    
    print("\n--- Testing Semantic Retrieval (RAG) ---")
    test_query = "What rules should I follow when writing database scripts?"
    search_results = memory.query_semantic_knowledge(test_query, n_results=1)
    
    print(f"Query: '{test_query}'")
    print(f"Retrieved Document Match: {search_results['documents'][0][0]}")