# coder-brain

Prototype implementation of a developer assistant agent inspired by human cognition tricks such as chunking, limited working memory and reliance on external tools. The project is derived from the discussion stored in `buffer.md`.

## Components

* **Indexing** – Scan a repository to build lightweight summaries that act as long-term memory.
* **Working memory** – Keep only a small sliding window of open files and contextual notes to mimic limited human working memory.
* **Tools** – Provide search and test runners that the agent can call instead of keeping everything mentally loaded.
* **Agent orchestration** – Combine the index, working memory, and tools to plan work on a task in iterative loops.

## Architecture diagram

```mermaid
flowchart LR
    Task["Task input"] --> Agent["Agent orchestration"]
    Agent --> WM["Working memory\n(sliding context)"]
    Agent --> Index["Indexing service"]
    Agent --> Tools["Tool controller"]
    WM --> Agent
    Index --> Agent
    Tools --> Agent
    Index --> Repo["Code repository"]
    Tools --> Search["Search / navigation"]
    Tools --> Tests["Test runner"]
    Search --> Repo
    Tests --> Repo
    Repo --> Index
```

## Usage

```bash
python -m coder_brain.cli --task "Fix login redirect bug" --root /path/to/project
```

The CLI prints a trace of the reasoning steps (plan, selected files, tool calls).

## Development

Install dev dependencies and run tests:

```bash
pip install -e .[dev]
pytest
```
