import json

def get_system_metrics() -> str:
    """Simulates checking host/container resource usage metrics."""
    # In a real app, this would use psutil or docker-py
    metrics = {
        "cpu_usage_percent": 12.5,
        "memory_available_gb": 48.2,
        "active_containers": 3
    }
    return json.dumps(metrics)

def write_to_file(filename: str, content: str) -> str:
    """Writes or appends generated content to a specified local file."""
    try:
        with open(filename, "w") as f:
            f.write(content)
        return f"Success: Content written to {filename}"
    except Exception as e:
        return f"Error writing to file: {str(e)}"

# A manifest explaining available tools to the LLM
AVAILABLE_TOOLS = {
    "get_system_metrics": get_system_metrics,
    "write_to_file": write_to_file
}