## Installation & Setup

### Prerequisites

- **Node.js** 18+ (for frontend and backend)
- **Python** 3.10+ (for RAG service)
- **LM Studio** running with a compatible model (Qwen or similar)
- **CUDA** optional but recommended for GPU acceleration

### Step 1: Clone & Setup RAG Service

```bash
cd rag-service
python -m venv venv

# Windows
venv\Scripts\activate

# macOS/Linux
source venv/bin/activate

pip install -r requirements.txt
```

**First Run**: Download embedding model (~2-8GB depending on choice). This happens automatically on first startup.

### Step 2: Start RAG Service

```bash
cd rag-service
python app.py
```

Expected output:
```
[RAG Service] Default extractor: text
[RAG Service] Default chunker: semantic
[RAG Service] Uvicorn running on http://0.0.0.0:8001
```

### Step 3: Setup & Start Backend

```bash
cd backend
npm install
npm start
```

Expected output:
```
Server listening on port 5000
```

### Step 4: Setup & Start Frontend

```bash
cd frontend
npm install
npm start
```

Frontend opens at `http://localhost:3000`

### Step 5: Ensure LM Studio is Running

- Start LM Studio
- Load a compatible model (e.g., Qwen3-4B)
- Server should be available at `http://127.0.0.1:8000`

## Configuration

### RAG Service Configuration (`rag-service/config.py`)

```python
# Embedding Model
EMBEDDING_MODEL = "intfloat/multilingual-e5-large-instruct"
E5_MODEL = True  # Set to True for E5 models
E5_QUERY_PREFIX = "query: "
E5_DOCUMENT_PREFIX = "passage: "

# Extraction Mode
PDF_EXTRACTOR_MODE = "text"  # "text" or "vision"

# Chunking Strategy
CHUNKER_MODE = "semantic"  # "semantic" or "agentic"
CHUNK_BREAKPOINT_THRESHOLD = 85  # Higher = fewer, larger chunks

# Agentic Chunker Settings
AGENTIC_CHUNKER_TEMPERATURE = 0.2
AGENTIC_CHUNKER_LIMIT = 10000
AGENTIC_CHUNKER_MAX_INPUT_CHARS = 9800
AGENTIC_CHUNK_MERGE_WINDOW = 0  # 0 = no merge, N = N neighbors each side

# ChromaDB
CHROMA_PERSIST_DIR = "rag-service/chroma_db"
COLLECTION_NAME = "pdf_documents"
```

### Environment Variables

```bash
# RAG Service
CHUNKER_MODE=semantic|agentic
PDF_EXTRACTOR_MODE=text|vision
AGENTIC_CHUNKER_API_URL=http://127.0.0.1:8000/chat/regular/stream
AGENTIC_CHUNKER_TEMPERATURE=0.2
AGENTIC_CHUNK_MERGE_WINDOW=0

# Backend
PORT=5000
RAG_SERVICE_URL=http://localhost:8001

# Frontend (in .env or package.json proxy)
REACT_APP_API_URL=http://localhost:5000
```

