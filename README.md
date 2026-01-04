# PDF Library Manager with AI Chatbot

A full-stack application for managing PDF documents with intelligent retrieval and conversational AI. Upload PDFs with automatic processing, manage tags, and chat with an AI assistant that can answer questions based on your document library using Retrieval-Augmented Generation (RAG).

## Features

### PDF Library Management
- **Multi-file Upload**: Drag-and-drop or click to upload multiple PDFs at once
- **Tag Management**: 
  - Add tags to PDFs during upload or edit them later
  - Inline tag editing with add/remove functionality
  - Filter library by tags or view "Untagged" documents
  - Tag-based filtering in RAG queries
- **PDF Viewing**: Click to view PDFs in a new browser tab
- **PDF Deletion**: Delete individual PDFs or clear the entire library
- **RAG Status Tracking**: Real-time status for PDF processing (Idle, Processing, Error)
- **File Validation**: PDF-only uploads with 10MB max file size
- **Reprocessing**:
  - Reprocess PDFs with different extraction and chunking options
  - **Rechunk-only mode**: Skip extraction and rechunk cached text (faster)
  - Choose between text and vision extraction
  - Select semantic or agentic chunking strategies
  - Adjust merge window for chunk merging

### Extraction Modes

#### Text Mode (Fast)
- Direct text extraction using PyMuPDF
- Best for text-heavy PDFs with clear structure
- Fast processing (seconds per document)
- Preserves layout and formatting

#### Vision Mode (Accurate)
- LLM-based OCR for scanned documents and images
- Extracts text from visually complex layouts
- Handles embedded images and handwriting
- Slower but more accurate for document images
- Batch processing for multiple pages

### Chunking Strategies

#### Semantic Chunking
- Uses embeddings to detect topic boundaries
- Creates chunks at natural semantic breaks
- Preserves context and coherence
- Adjustable threshold (percentile-based)
- Optimal for semantic search and RAG

#### Agentic Chunking
- LLM-driven intelligent chunking
- Uses Claude to identify logical boundaries
- Creates chunks based on semantic meaning
- Fallback to character-level splitting for large pages
- Configurable temperature and token limit
- **Merge Window**: Combine adjacent chunks for additional context
  - 0 = no merging (isolated chunks)
  - N = include N neighbors on each side (N before + N after)

### AI Chatbot
- **Multi-modal Conversation**: Chat with AI in real-time
- **Streaming Responses**: Real-time text rendering as AI responds
- **RAG Integration**: Toggle RAG mode to search document library
- **Tag Filtering**: Filter RAG search by specific tags
- **Source Citations**: See which documents contributed to each answer
- **Markdown Support**: Responses render with tables, code blocks, and formatting
- **Chat History**:
  - Save conversations automatically or manually
  - Load previous chats to continue conversations
  - Delete chat history
  - New chat button to start fresh conversations
- **Resizable Chat Window**: Drag corners to resize (preference saved in localStorage)
- **Conversation Memory**: Full context maintained for coherent multi-turn conversations

### RAG (Retrieval-Augmented Generation)
- **Semantic Search**: Find relevant document chunks using embeddings
- **Grounded Responses**: AI answers based on actual document content
- **Multi-language Support**: Multilingual embedding model for documents in various languages
- **Tag-based Filtering**: Narrow searches to specific document groups
- **Source Attribution**: Shows which documents and pages were used
- **Similarity Scoring**: View relevance scores for retrieved chunks
- **Vector Database**: ChromaDB for persistent, scalable storage
- **Advanced Retrieval Options**: Configurable retrieval parameters

### Embedding Model
- **Default**: `intfloat/multilingual-e5-large-instruct`
  - Multilingual support
  - 1024 dimensions
  - Ideal for RAG
- **Alternatives Available**:
  - `Qwen/Qwen3-Embedding-0.6B` - Lightweight multilingual
  - `Qwen/Qwen3-Embedding-4B` - Larger, higher quality
  - `sentence-transformers/all-MiniLM-L6-v2` - Fast, English-only
  - `BAAI/bge-large-en-v1.5` - High performance

## Architecture

### Technology Stack

**Frontend**
- React 18 with hooks
- Axios for API communication
- ReactMarkdown for formatted text rendering
- Custom CSS with responsive design

**Backend**
- Node.js / Express
- Multer for file uploads
- UUID for unique identifiers
- CORS for cross-origin requests
- JSON file persistence

**RAG Service**
- FastAPI (Python)
- HuggingFace Transformers for embeddings
- ChromaDB for vector storage
- LangChain for semantic chunking
- PyMuPDF for PDF text extraction
- Vision transformers for OCR (optional)

**LLM Integration**
- LM Studio for local model serving
- NDJSON streaming for real-time responses
- Support for Qwen and other compatible models

### System Architecture

```
┌─────────────────┐         ┌──────────────────┐         ┌─────────────────┐
│    Frontend     │◄────────│   Backend API    │◄────────│  RAG Service    │
│   (React)       │ (Port   │   (Express)      │ (Port   │   (FastAPI)     │
│                 │  5000)  │                  │  8001)  │   (Port 8001)   │
└────────┬────────┘         └──────────────────┘         └────────┬────────┘
         │                          │                              │
         │ PDF Upload              │                              │
         │ Tag Management          │ File Upload & Processing     │
         │ Chat Messages           │ RAG Queries                  │
         │                          │ Config Management            │
         └──────────────────────────┴──────────────────────────────┘
                                    │
                                    ▼
                    ┌───────────────────────────┐
                    │  Vector Database (Chroma) │
                    │  Embedding Model (HF)     │
                    │  Chunk Cache              │
                    └───────────────────────────┘
                                    │
                                    ▼
                        ┌───────────────────────┐
                        │   LM Studio (Local)   │
                        │   LLM Model Serving   │
                        └───────────────────────┘
```

### Data Flow

1. **PDF Upload**
   - Frontend sends PDF files and tags
   - Backend validates and stores files
   - Backend sends to RAG service for processing
   - RAG service extracts text (text or vision mode)
   - Text is chunked (semantic or agentic)
   - Chunks are embedded and stored in ChromaDB

2. **Chat with RAG**
   - User types message
   - If RAG enabled: Query RAG service for relevant chunks
   - Optional: Filter by selected tags
   - Chunks are injected into system prompt
   - Query sent to LM Studio with full context
   - LM Studio streams response back
   - Response displayed with source citations

3. **Chat History**
   - Conversations saved to backend
   - User can load previous chats
   - Full conversation context maintained
   - Chats stored in `backend/chats.json`

## API Endpoints

### PDF Management

- `GET /api/pdfs` - Get all PDFs with tags and RAG status
- `POST /api/upload` - Upload PDF files with tags
  - Body: `{ pdfs: [File], tags: string, processingOptions: {...} }`
- `PUT /api/pdfs/:id` - Update PDF tags
  - Body: `{ tags: [string] }`
- `DELETE /api/pdfs/:id` - Delete single PDF
- `DELETE /api/pdfs` - Delete all PDFs and clear RAG index

### Chat Management

- `GET /api/chats` - Get all saved chats
- `GET /api/chats/:id` - Get specific chat
- `POST /api/chats` - Save/create chat
  - Body: `{ messages: [...], title: string }`
- `DELETE /api/chats/:id` - Delete chat

### RAG Operations

- `POST /api/rag/reprocess/:id` - Reprocess PDF with options
  - Body: `{ processingOptions: { extractor_mode, chunker_mode, merge_window, rechunkOnly } }`
- `GET /api/rag/config` - Get RAG configuration and defaults
- `GET /api/rag/status` - Check RAG service health and available tags
- `GET /api/rag/tags` - Get all indexed document tags
- `GET /api/rag/stats` - Get RAG index statistics
- `GET /cache/:pdf_id` - Check if extraction cache exists

### RAG Service Endpoints (Port 8001)

- `POST /process-pdf` - Process PDF from upload
- `POST /process-pdf-path` - Process PDF from file path
- `POST /rechunk/:pdf_id` - Rechunk using cached extraction
- `POST /query` - Semantic search with optional tag filtering
  - Body: `{ query: string, tags: [string] }`
- `DELETE /document/:id` - Remove document from index
- `PUT /document/:id/tags` - Update document tags
- `GET /tags` - Get all unique tags in index
- `GET /stats` - Get index statistics
- `GET /health` - Health check

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

## Usage Guide

### Uploading PDFs

1. Click upload area or drag PDFs onto it
2. Add tags (comma-separated) for organization
3. Expand "Advanced Options" to select:
   - **Extractor**: Text (fast) or Vision (OCR)
   - **Chunker**: Semantic (embedding-based) or Agentic (LLM-based)
   - **Merge Window**: 0 (no merge) to 5+ (more context)
4. Click "Upload & Process"
5. Monitor RAG status in the library table

### Managing the Library

- **Filter by Tag**: Click a tag name to show only PDFs with that tag
- **Untagged View**: Select "Untagged" to see PDFs without tags
- **Edit Tags**: Click the edit icon to add/remove tags inline
- **View PDF**: Click the eye icon to open in a new tab
- **Delete PDF**: Click the trash icon (removes from vector database too)
- **Reprocess**: Click the retry icon to reprocess with different options
  - Checkbox appears if cached extraction exists
  - Check "Rechunk only" to skip extraction (faster)

### Using the Chatbot

1. **Open Chat**: Click the chat bubble in bottom-right
2. **Enable RAG**: Click the search icon to toggle RAG mode
3. **Select Tags** (optional): Click filter icon to narrow search scope
4. **Type Message**: Use Shift+Enter for newline, Enter to send
5. **View Response**: Responses include source citations
6. **Save Chat**: Click save icon to persist conversation
7. **Load Chat**: Select from history list on the left
8. **Resize**: Drag the bottom-right corner to resize window

### Reprocessing with Different Options

1. Click the retry icon on a PDF row
2. If extraction is cached, a "Rechunk only" checkbox appears
3. **Rechunk Only** (Checked):
   - Skip extraction, reuse cached text
   - Change chunker or merge window
   - 3-5x faster than full reprocessing
4. **Full Reprocess** (Unchecked):
   - Re-extract text with chosen extractor
   - Then chunk with chosen strategy
   - Use when source PDF changed or different OCR needed
5. Click "Process" or "Rechunk" to start

## Performance Considerations

### Extraction Speed
- **Text Mode**: 1-3 seconds per page (PyMuPDF)
- **Vision Mode**: 10-30 seconds per page (LLM-based OCR)
- Batch processing available for multiple pages

### Chunking Speed
- **Semantic**: Fast, embedding-based (1-2 seconds)
- **Agentic**: Slower, LLM-driven (5-30 seconds depending on merge window)

### RAG Query Speed
- Vector search: <100ms
- With tag filtering: <100ms
- End-to-end with LLM response: 1-5 seconds

### Storage
- ChromaDB: ~500KB per 1000 chunks
- Extraction Cache: Original PDF size
- Chat History: ~1KB per message

## Troubleshooting

### RAG Service Won't Start
```
ModuleNotFoundError: No module named 'transformers'
```
**Solution**: Ensure Python environment is activated and requirements installed
```bash
cd rag-service
source venv/bin/activate  # or venv\Scripts\activate on Windows
pip install -r requirements.txt
```

### LM Studio Not Connecting
```
Error: Failed to connect to LM Studio
```
**Solution**: 
1. Ensure LM Studio is running
2. Check port 8000 is accessible: `curl http://127.0.0.1:8000/health`
3. Verify model is loaded in LM Studio
4. Check firewall settings

### Vision Mode Extraction Failing
```
Error: Vision extraction failed
```
**Causes**:
- Model not available (downloads automatically)
- Insufficient GPU memory
- Large PDF (>50 pages)

**Solution**: 
- Use text mode instead
- Reduce batch size
- Check GPU memory with `nvidia-smi`

### Chunks Appear Too Large/Small
**Solution**: Adjust in PDFUpload component or reprocess with different settings:
- Larger chunks: Increase merge window or lower semantic threshold
- Smaller chunks: Decrease merge window or raise semantic threshold

### Chat History Not Persisting
**Solution**: Check `backend/chats.json` permissions and disk space

## File Structure

```
RAGChat/
├── frontend/                    # React frontend
│   ├── src/
│   │   ├── App.js              # Main app component
│   │   ├── App.css
│   │   ├── components/
│   │   │   ├── PDFUpload.js     # Upload with processing options
│   │   │   ├── PDFUpload.css
│   │   │   ├── PDFLibrary.js    # Library management & reprocess
│   │   │   ├── PDFLibrary.css
│   │   │   ├── Chatbot.js       # Chat UI with RAG
│   │   │   └── Chatbot.css
│   │   └── index.js
│   ├── public/
│   │   └── index.html
│   └── package.json
├── backend/                     # Express backend
│   ├── server.js               # Main server & API routes
│   ├── database.json           # PDF metadata storage
│   ├── chats.json              # Chat history storage
│   ├── uploads/                # Uploaded PDF files
│   ├── package.json
│   └── .gitignore
├── rag-service/                # FastAPI RAG service
│   ├── app.py                  # Main FastAPI app & endpoints
│   ├── config.py               # Configuration settings
│   ├── embeddings.py           # Embedding model wrapper
│   ├── pdf_extractor.py        # Text extraction (PyMuPDF)
│   ├── vision_pdf_extractor.py # Vision extraction (LLM)
│   ├── chunker.py              # Semantic chunking
│   ├── agentic_chunker.py      # LLM-driven chunking
│   ├── vector_store.py         # ChromaDB operations
│   ├── chroma_db/              # Vector database storage
│   ├── extraction_cache/       # Cached PDF text
│   ├── requirements.txt
│   └── cache/                  # Model and tool cache
├── .github/
│   └── copilot-instructions.md # Design system & standards
├── .vscode/
│   └── tasks.json              # VS Code development tasks
├── .gitignore
└── README.md
```

## Development

### Running in Development Mode

**Terminal 1: RAG Service**
```bash
cd rag-service
source venv/bin/activate
python app.py
```

**Terminal 2: Backend**
```bash
cd backend
npm run dev  # Uses nodemon for auto-reload
```

**Terminal 3: Frontend**
```bash
cd frontend
npm start
```

### Code Standards

- **Frontend**: React functional components with hooks
- **Backend**: Express RESTful API with async/await
- **RAG Service**: FastAPI with Pydantic models
- **UI Design**: Solid colors, SVG icons, minimal shadows
- **Color Palette**:
  - Primary: `#7A9E9F` (Muted teal)
  - Background: `#f7f7f8` (Light gray)
  - Text: `#333333` (Dark gray)

## Future Enhancements

- [ ] Multi-language support for UI
- [ ] Advanced search filters (date range, file size)
- [ ] Document summarization
- [ ] Export chat to PDF/Markdown
- [ ] User authentication and multi-user support
- [ ] PDF annotation within the app
- [ ] Batch re-embeddings for all documents
- [ ] Custom RAG prompt templates
- [ ] Document similarity clustering
- [ ] Integration with cloud storage (S3, OneDrive)

## License

ISC

## Support

For issues and questions:
1. Check the Troubleshooting section
2. Review configuration in `rag-service/config.py`
3. Check logs in terminal output
4. Verify all services are running on correct ports
