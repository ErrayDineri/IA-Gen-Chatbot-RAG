# GitHub Copilot Instructions for PDF Library Manager with AI Chatbot

## Project Overview
This is a full-stack PDF Library Manager application with a React frontend and Node.js/Express backend. Features include PDF file upload with tagging, PDF library browsing with tag filtering, and an integrated AI chatbot powered by LM Studio with streaming responses. The UI is designed to be modern and similar to ChatGPT with clean SVG icons and a minimalist aesthetic.

## Design System

### Color Theme
Use the following color palette throughout the application:

**Primary Colors:**
- Primary Accent: `#7A9E9F` (Muted teal) - Main action buttons, active states, icons
- Background: `#f7f7f8` (Light gray) - Main app background
- Card/Panel: `#ffffff` (White) - Cards, panels, message bubbles
- Text: `#333333` (Dark gray) - Primary text
- Secondary Text: `#666666` (Medium gray) - Labels, secondary info
- Border: `#e5e5e5` (Light gray) - Borders, dividers

**Removed Colors:**
- `#B8D8D8` and `#A27E8E` are deprecated (no longer used)

**Color Usage Guidelines:**
- Use `#f7f7f8` for main application background
- Use `#ffffff` for cards, panels, message bubbles, and input fields
- Use `#7A9E9F` for primary buttons, active states, icon colors, and highlights
- Use `#e5e5e5` for subtle borders and dividers
- Avoid using gradients; use solid colors for a modern, clean aesthetic
- Maintain proper contrast ratios for accessibility

### Icon System
- Use clean SVG icons instead of emojis throughout the application
- Icon stroke-width: 2 for most icons, 1.5 for avatars
- Icon colors should match the context (accent color for interactive elements)
- Common icon replacements:
  - Document/File: `<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>`
  - Upload: `<polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>`
  - Send: `<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>`
  - Trash: `<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>`
  - Edit: `<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>`
  - Eye/View: `<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>`
  - X/Close: `<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>`
  - Checkmark: `<polyline points="20 6 9 17 4 12"/>`
  - Chat: `<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>`

### Component Styling
- Apply solid colors consistently across all React components
- Keep borders subtle (1px, `#e5e5e5`)
- Use minimal shadows (0 2px 8px rgba(0,0,0,0.08))
- Border-radius: 6-12px for most elements
- Avoid gradients and decorative effects
- Focus on clean typography and whitespace

## Code Standards

### Frontend (React)
- Use functional components with hooks
- Keep components modular and reusable
- Use separate CSS files for styling (not CSS modules)
- Follow React best practices for state management and effects
- Use axios for API calls to backend
- Use ReactMarkdown with remark-gfm for markdown rendering in chatbot messages
- SVG icons: Use inline SVG in JSX, not emoji characters
- Textarea elements: Support Shift+Enter for newlines, Enter for submit

### Backend (Node.js/Express)
- Implement RESTful API patterns with proper status codes
- Use proper error handling middleware
- Validate file uploads (PDF only, max 10MB)
- Keep routes organized and documented
- Use async/await for asynchronous operations
- Support NDJSON streaming for LLM integration
- File persistence: Use JSON files (database.json for PDFs, chats.json for chat history)

## File Structure
- Frontend code in `/frontend` directory
  - Components in `src/components/` (PDFUpload, PDFLibrary, Chatbot)
  - Styles in `src/components/*.css` files
  - Main App component in `src/App.js`
- Backend code in `/backend` directory
  - Express server in `server.js`
  - PDF uploads stored in `/backend/uploads`
  - Data files: `database.json` (PDFs), `chats.json` (chat history)
- RAG Service in `/rag-service` directory
  - FastAPI Python service for embedding, chunking, and retrieval
  - ChromaDB vector storage in `rag-service/chroma_data/`
  - Configuration in `rag-service/config.py`
- Configuration in `.github/copilot-instructions.md`

## Features to Maintain
- Multi-file drag and drop PDF upload
- Tag management (add, edit, remove) with inline editing
- PDF library table/list view with scrolling
- Tag-based filtering with "All" and "Untagged" options
- File validation (PDF only, max 10MB)
- Delete functionality with confirmation dialogs
- View PDFs in new browser tab
- AI Chatbot with:
  - LM Studio integration (qwen3-4b model)
  - Streaming responses with real-time text rendering
  - Markdown support with tables and formatting
  - Resizable chat window (stored in localStorage)
  - Chat history with save/load/delete (backend storage)
  - New chat creation
  - Conversation memory for context
  - RAG (Retrieval-Augmented Generation) integration:
    - Toggle RAG mode on/off with search icon button
    - Tag-based document filtering for targeted retrieval
    - Source citations displayed below AI responses
    - Semantic search across uploaded PDFs

## RAG Pipeline Architecture

### Technology Stack
- **Embedding Model**: Qwen3-Embedding-4B (HuggingFace transformers)
- **Vector Database**: ChromaDB with persistent storage
- **Chunking**: LangChain SemanticChunker (splits at topic boundaries)
- **PDF Extraction**: PyMuPDF (fitz) with page-level granularity
- **Service**: FastAPI Python microservice on port 8001

### RAG Service Files (rag-service/)
- `config.py` - Configuration settings (model, paths, chunking thresholds)
- `embeddings.py` - Singleton wrapper for HuggingFace embeddings
- `chunker.py` - SemanticDocumentChunker with fallback to character splitting
- `pdf_extractor.py` - PDF text extraction functions
- `vector_store.py` - ChromaDB operations with tag filtering
- `app.py` - FastAPI endpoints
- `requirements.txt` - Python dependencies

### RAG Workflow
1. PDF uploaded → Backend sends to RAG service
2. RAG service extracts text, chunks semantically, generates embeddings
3. Chunks stored in ChromaDB with metadata (filename, tags, page)
4. User query → RAG service finds similar chunks (optionally filtered by tags)
5. Context injected into LLM prompt for grounded responses
6. Sources displayed to user with similarity scores

## API Endpoints

### PDF Management
- `POST /api/upload` - Upload PDF files with tags (also processes for RAG)
- `GET /api/pdfs` - Get all PDFs
- `PUT /api/pdfs/:id` - Update PDF tags (syncs with RAG service)
- `DELETE /api/pdfs/:id` - Delete PDF (removes from RAG index)

### Chat Management  
- `GET /api/chats` - Get all saved chats
- `GET /api/chats/:id` - Get specific chat
- `POST /api/chats` - Save/create chat
- `DELETE /api/chats/:id` - Delete chat

### RAG Management (Backend)
- `POST /api/rag/query` - Query RAG with optional tag filtering
- `GET /api/rag/status` - Check RAG service availability
- `GET /api/rag/tags` - Get all indexed tags
- `GET /api/rag/stats` - Get RAG index statistics
- `POST /api/rag/reprocess/:id` - Re-process a PDF for RAG

### RAG Service (Port 8001)
- `POST /process-pdf` - Process PDF bytes for indexing
- `POST /process-pdf-path` - Process PDF from file path
- `POST /query` - Semantic search with tag filtering
- `DELETE /document/{id}` - Remove document from index
- `PUT /document/{id}/tags` - Update document tags
- `GET /tags` - Get all unique tags
- `GET /stats` - Get index statistics
- `GET /health` - Health check

### LLM Integration
- External: `POST http://127.0.0.1:8000/chat/regular/stream`
  - Expects: `{ messages: [{role, content}], config: {temperature, limit} }`
  - Returns: NDJSON stream with format `{"content":"text"}`

## Running the Application

### Prerequisites
- Node.js 18+
- Python 3.10+ with CUDA (optional, for GPU acceleration)
- LM Studio running with qwen3-4b model on port 8000

### Start Services
1. **RAG Service**: `cd rag-service && pip install -r requirements.txt && python app.py`
2. **Backend**: `cd backend && npm install && node server.js`
3. **Frontend**: `cd frontend && npm install && npm start`

## Important Notes
- Do NOT create README files
- Remove all emoji characters - use SVG icons instead
- Maintain consistent clean, modern design across all new components
- Keep the UI minimal and similar to ChatGPT
- Ensure responsive design for different screen sizes
- Preserve existing functionality when adding new features
- Use solid colors only (no gradients)
- Window size preference stored in localStorage, chat history in backend
- RAG service requires first-run model download (~8GB for Qwen3-Embedding-4B)
