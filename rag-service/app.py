"""FastAPI RAG service for PDF document retrieval."""

from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import uvicorn
import os

from config import (
    HOST, PORT, PDF_EXTRACTOR_MODE, CHUNKER_MODE, AGENTIC_CHUNK_MERGE_WINDOW
)

# Import BOTH extractors so we can choose per-request
from pdf_extractor import (
    extract_text_from_pdf as text_extract,
    extract_text_from_bytes as text_extract_from_bytes,
)
from vision_pdf_extractor import (
    extract_text_with_vision as vision_extract,
    extract_text_from_bytes_with_vision as vision_extract_from_bytes,
    BatchVisionExtractor
)

# Import BOTH chunkers
from chunker import semantic_chunker
from agentic_chunker import agentic_chunker, _merge_adjacent_chunks

from vector_store import vector_store

print(f"[RAG Service] Default extractor: {PDF_EXTRACTOR_MODE}")
print(f"[RAG Service] Default chunker: {CHUNKER_MODE}")
print(f"[RAG Service] Default merge window: {AGENTIC_CHUNK_MERGE_WINDOW}")


# =============================================================================
# PROCESSING OPTIONS HELPERS
# =============================================================================

class ProcessingOptions:
    """Container for per-request processing options."""
    def __init__(
        self,
        extractor_mode: str = None,
        chunker_mode: str = None,
        merge_window: int = None
    ):
        self.extractor_mode = (extractor_mode or PDF_EXTRACTOR_MODE).lower().strip()
        self.chunker_mode = (chunker_mode or CHUNKER_MODE).lower().strip()
        self.merge_window = merge_window if merge_window is not None else AGENTIC_CHUNK_MERGE_WINDOW


async def extract_with_options(file_path: str, options: ProcessingOptions):
    """Extract text using the specified extractor mode."""
    if options.extractor_mode == "vision":
        return await vision_extract(file_path)
    return text_extract(file_path)


async def extract_bytes_with_options(file_bytes: bytes, filename: str, options: ProcessingOptions):
    """Extract text from bytes using the specified extractor mode."""
    if options.extractor_mode == "vision":
        return await vision_extract_from_bytes(file_bytes, filename)
    return text_extract_from_bytes(file_bytes, filename)


def chunk_with_options(pages, base_metadata, options: ProcessingOptions):
    """Chunk using the specified chunker mode and merge window."""
    if options.chunker_mode == "agentic":
        # Pass merge_window to agentic chunker (it handles merge internally)
        chunks = agentic_chunker.chunk_pages(pages, base_metadata, merge_window=options.merge_window)
    else:
        chunks = semantic_chunker.chunk_pages(pages, base_metadata)
        # Apply merge to semantic chunks if requested
        if options.merge_window >= 1 and len(chunks) > 1:
            chunks = _merge_adjacent_chunks(chunks, options.merge_window)
    
    return chunks


# =============================================================================
# EXTRACTION CACHE
# =============================================================================
import json

EXTRACTION_CACHE_DIR = os.path.join(os.path.dirname(__file__), "extraction_cache")
os.makedirs(EXTRACTION_CACHE_DIR, exist_ok=True)


def _get_cache_path(pdf_id: str) -> str:
    """Get the cache file path for a PDF ID."""
    return os.path.join(EXTRACTION_CACHE_DIR, f"{pdf_id}.json")


def save_extraction_cache(pdf_id: str, pdf_data: dict, filename: str, tags: list):
    """Save extracted PDF data to cache."""
    try:
        cache_data = {
            "pdf_id": pdf_id,
            "filename": filename,
            "tags": tags,
            "pdf_data": pdf_data
        }
        cache_path = _get_cache_path(pdf_id)
        with open(cache_path, 'w', encoding='utf-8') as f:
            json.dump(cache_data, f, ensure_ascii=False)
        print(f"[Cache] Saved extraction for {pdf_id}")
    except Exception as e:
        print(f"[Cache] Failed to save: {e}")


def load_extraction_cache(pdf_id: str) -> Optional[dict]:
    """Load extracted PDF data from cache."""
    try:
        cache_path = _get_cache_path(pdf_id)
        if os.path.exists(cache_path):
            with open(cache_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            print(f"[Cache] Loaded extraction for {pdf_id}")
            return data
    except Exception as e:
        print(f"[Cache] Failed to load: {e}")
    return None


def delete_extraction_cache(pdf_id: str):
    """Delete cached extraction for a PDF."""
    try:
        cache_path = _get_cache_path(pdf_id)
        if os.path.exists(cache_path):
            os.remove(cache_path)
            print(f"[Cache] Deleted extraction for {pdf_id}")
    except Exception as e:
        print(f"[Cache] Failed to delete: {e}")


app = FastAPI(
    title="RAG Service",
    description="PDF document RAG pipeline with semantic chunking and tag filtering",
    version="1.0.0"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Request/Response models
class ProcessPDFRequest(BaseModel):
    pdf_id: str
    filename: str
    tags: List[str] = []
    file_path: Optional[str] = None  # Path to PDF file on server
    # Processing options (optional - uses defaults from config if not provided)
    extractor_mode: Optional[str] = None  # "text" | "vision"
    chunker_mode: Optional[str] = None    # "semantic" | "agentic"
    merge_window: Optional[int] = None    # 0-5, context overlap window


class QueryRequest(BaseModel):
    query: str
    tags: Optional[List[str]] = None
    pdf_ids: Optional[List[str]] = None
    top_k: int = 5


class UpdateTagsRequest(BaseModel):
    pdf_id: str
    tags: List[str]


class QueryResult(BaseModel):
    id: str
    text: str
    metadata: dict
    similarity: float


class QueryResponse(BaseModel):
    results: List[QueryResult]
    query: str
    filters: dict


class ProcessResponse(BaseModel):
    success: bool
    pdf_id: str
    chunks_created: int
    message: str


class BatchProcessItem(BaseModel):
    pdf_id: str
    filename: str
    tags: List[str] = []


class BatchProcessPathItem(BaseModel):
    pdf_id: str
    filename: str
    file_path: str
    tags: List[str] = []
    # Processing options (optional - uses defaults from config if not provided)
    extractor_mode: Optional[str] = None  # "text" | "vision"
    chunker_mode: Optional[str] = None    # "semantic" | "agentic"
    merge_window: Optional[int] = None    # 0-5, context overlap window


class BatchProcessPathRequest(BaseModel):
    items: List[BatchProcessPathItem]
    # Global processing options (can be overridden per-item)
    extractor_mode: Optional[str] = None
    chunker_mode: Optional[str] = None
    merge_window: Optional[int] = None


class BatchProcessResponse(BaseModel):
    success: bool
    processed: int
    failed: int
    results: List[dict]


class RechunkRequest(BaseModel):
    """Request to rechunk a PDF using cached extraction."""
    pdf_id: str
    # Processing options for chunking only
    chunker_mode: Optional[str] = None    # "semantic" | "agentic"
    merge_window: Optional[int] = None    # 0-5, context overlap window


class CacheStatusResponse(BaseModel):
    """Response for cache status check."""
    pdf_id: str
    has_cache: bool
    filename: Optional[str] = None


# Endpoints
@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "documents_count": vector_store.get_document_count(),
        "available_tags": vector_store.get_all_tags()
    }


@app.get("/config")
async def get_config():
    """Get default processing configuration options."""
    return {
        "defaults": {
            "extractor_mode": PDF_EXTRACTOR_MODE,
            "chunker_mode": CHUNKER_MODE,
            "merge_window": AGENTIC_CHUNK_MERGE_WINDOW
        },
        "options": {
            "extractor_modes": ["text", "vision"],
            "chunker_modes": ["semantic", "agentic"],
            "merge_window_range": [0, 5]
        }
    }


@app.post("/process-pdf", response_model=ProcessResponse)
async def process_pdf_file(
    file: UploadFile = File(...),
    pdf_id: str = Form(...),
    filename: str = Form(...),
    tags: str = Form(""),  # Comma-separated tags
    extractor_mode: str = Form(""),  # "text" | "vision" (empty = use default)
    chunker_mode: str = Form(""),    # "semantic" | "agentic" (empty = use default)
    merge_window: str = Form("")     # 0-5 (empty = use default)
):
    """
    Process a PDF file: extract text, chunk, and store embeddings.
    Supports per-request processing options.
    """
    try:
        # Build processing options
        options = ProcessingOptions(
            extractor_mode=extractor_mode if extractor_mode else None,
            chunker_mode=chunker_mode if chunker_mode else None,
            merge_window=int(merge_window) if merge_window else None
        )
        
        # Read file bytes
        file_bytes = await file.read()
        
        # Parse tags
        tags_list = [t.strip() for t in tags.split(",") if t.strip()]
        
        # Extract text from PDF
        print(f"[{options.extractor_mode.upper()}] Extracting text from PDF: {filename}")
        pdf_data = await extract_bytes_with_options(file_bytes, filename, options)
        
        if not pdf_data["pages"]:
            raise HTTPException(status_code=400, detail="No text content found in PDF")
        
        # Chunk the document
        print(f"Chunking {len(pdf_data['pages'])} pages with {options.chunker_mode} chunker...")
        base_metadata = {
            "filename": filename,
            "total_pages": pdf_data["total_pages"],
            "pdf_title": pdf_data["metadata"].get("title", ""),
            "pdf_author": pdf_data["metadata"].get("author", ""),
        }
        
        chunks = chunk_with_options(pdf_data["pages"], base_metadata, options)
        
        if not chunks:
            raise HTTPException(status_code=400, detail="Could not create chunks from PDF")
        
        # Store in vector database
        print(f"Storing {len(chunks)} chunks in vector store...")
        chunks_added = vector_store.add_documents(
            chunks=chunks,
            pdf_id=pdf_id,
            filename=filename,
            tags=tags_list
        )
        
        return ProcessResponse(
            success=True,
            pdf_id=pdf_id,
            chunks_created=chunks_added,
            message=f"Successfully processed {filename}: {chunks_added} chunks created"
        )
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error processing PDF: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/process-batch", response_model=BatchProcessResponse)
async def process_batch_pdfs(request: BatchProcessPathRequest):
    """
    Process multiple PDFs efficiently using file paths.
    Supports per-request processing options (global or per-item).
    
    In vision mode:
    1. Load vision model ONCE
    2. Extract text from ALL PDFs
    3. Switch to text model ONCE
    4. Chunk ALL documents
    
    In text mode:
    - Extract and chunk each PDF sequentially (no model switching needed)
    """
    try:
        items = request.items
        
        if not items:
            raise HTTPException(status_code=400, detail="No items provided")
        
        # Build global processing options from request (or use defaults)
        global_options = ProcessingOptions(
            extractor_mode=request.extractor_mode,
            chunker_mode=request.chunker_mode,
            merge_window=request.merge_window
        )
        
        results = []
        extracted_data = []  # Store extraction results for chunking phase
        
        extractor_mode = global_options.extractor_mode
        
        # =========================================
        # PHASE 1: Extract ALL PDFs
        # =========================================
        print(f"[Batch] Starting extraction of {len(items)} PDFs using {extractor_mode} mode...")
        
        if extractor_mode == "vision":
            # Vision mode: use batch extractor for efficient model loading
            async with BatchVisionExtractor() as extractor:
                for i, item in enumerate(items):
                    pdf_id = item.pdf_id
                    filename = item.filename
                    file_path = item.file_path
                    tags = item.tags
                    
                    # Per-item options (fallback to global)
                    item_options = ProcessingOptions(
                        extractor_mode=item.extractor_mode or global_options.extractor_mode,
                        chunker_mode=item.chunker_mode or global_options.chunker_mode,
                        merge_window=item.merge_window if item.merge_window is not None else global_options.merge_window
                    )
                    
                    try:
                        if not os.path.exists(file_path):
                            raise FileNotFoundError(f"File not found: {file_path}")
                        
                        print(f"[Batch] Extracting {i+1}/{len(items)}: {filename}")
                        pdf_data = await extractor.extract_from_path(file_path)
                        
                        extracted_data.append({
                            "pdf_id": pdf_id,
                            "filename": filename,
                            "tags": tags,
                            "pdf_data": pdf_data,
                            "options": item_options,
                            "error": None
                        })
                    except Exception as e:
                        print(f"[Batch] Extraction failed for {filename}: {e}")
                        extracted_data.append({
                            "pdf_id": pdf_id,
                            "filename": filename,
                            "tags": tags,
                            "pdf_data": None,
                            "options": item_options,
                            "error": str(e)
                        })
                
                # Only switch to text model if any item uses agentic chunking
                needs_text_model = any(
                    item.get("options", ProcessingOptions()).chunker_mode == "agentic"
                    for item in extracted_data
                )
                if needs_text_model:
                    await extractor.prepare_for_chunking()
                else:
                    print("[Batch] Using semantic chunking - no text model needed")
        else:
            # Text mode: extract each PDF sequentially
            for i, item in enumerate(items):
                pdf_id = item.pdf_id
                filename = item.filename
                file_path = item.file_path
                tags = item.tags
                
                # Per-item options (fallback to global)
                item_options = ProcessingOptions(
                    extractor_mode=item.extractor_mode or global_options.extractor_mode,
                    chunker_mode=item.chunker_mode or global_options.chunker_mode,
                    merge_window=item.merge_window if item.merge_window is not None else global_options.merge_window
                )
                
                try:
                    if not os.path.exists(file_path):
                        raise FileNotFoundError(f"File not found: {file_path}")
                    
                    print(f"[Batch] Extracting {i+1}/{len(items)}: {filename}")
                    pdf_data = text_extract(file_path)
                    
                    extracted_data.append({
                        "pdf_id": pdf_id,
                        "filename": filename,
                        "tags": tags,
                        "pdf_data": pdf_data,
                        "options": item_options,
                        "error": None
                    })
                except Exception as e:
                    print(f"[Batch] Extraction failed for {filename}: {e}")
                    extracted_data.append({
                        "pdf_id": pdf_id,
                        "filename": filename,
                        "tags": tags,
                        "pdf_data": None,
                        "options": item_options,
                        "error": str(e)
                    })
        
        # =========================================
        # PHASE 2: Chunk ALL documents
        # =========================================
        print(f"[Batch] Starting chunking phase...")
        
        processed = 0
        failed = 0
        
        for item in extracted_data:
            pdf_id = item["pdf_id"]
            filename = item["filename"]
            options = item["options"]
            
            # Handle extraction errors
            if item["error"]:
                failed += 1
                results.append({
                    "pdf_id": pdf_id,
                    "filename": filename,
                    "success": False,
                    "chunks_created": 0,
                    "error": f"Extraction failed: {item['error']}"
                })
                continue
            
            pdf_data = item["pdf_data"]
            
            if not pdf_data or not pdf_data.get("pages"):
                failed += 1
                results.append({
                    "pdf_id": pdf_id,
                    "filename": filename,
                    "success": False,
                    "chunks_created": 0,
                    "error": "No text content found in PDF"
                })
                continue
            
            try:
                # Chunk the document with per-item options
                print(f"[Batch] Chunking: {filename} ({len(pdf_data['pages'])} pages) with {options.chunker_mode}")
                base_metadata = {
                    "filename": filename,
                    "total_pages": pdf_data["total_pages"],
                    "pdf_title": pdf_data["metadata"].get("title", ""),
                    "pdf_author": pdf_data["metadata"].get("author", ""),
                }
                
                chunks = chunk_with_options(pdf_data["pages"], base_metadata, options)
                
                if not chunks:
                    failed += 1
                    results.append({
                        "pdf_id": pdf_id,
                        "filename": filename,
                        "success": False,
                        "chunks_created": 0,
                        "error": "Could not create chunks from PDF"
                    })
                    continue
                
                # Store in vector database
                print(f"[Batch] Storing {len(chunks)} chunks for {filename}")
                chunks_added = vector_store.add_documents(
                    chunks=chunks,
                    pdf_id=pdf_id,
                    filename=filename,
                    tags=item["tags"]
                )
                
                processed += 1
                results.append({
                    "pdf_id": pdf_id,
                    "filename": filename,
                    "success": True,
                    "chunks_created": chunks_added,
                    "error": None
                })
                
            except Exception as e:
                failed += 1
                results.append({
                    "pdf_id": pdf_id,
                    "filename": filename,
                    "success": False,
                    "chunks_created": 0,
                    "error": str(e)
                })
        
        print(f"[Batch] Complete: {processed} processed, {failed} failed")
        
        return BatchProcessResponse(
            success=failed == 0,
            processed=processed,
            failed=failed,
            results=results
        )
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error in batch processing: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/process-pdf-path", response_model=ProcessResponse)
async def process_pdf_from_path(request: ProcessPDFRequest):
    """
    Process a PDF file from a server path.
    Supports per-request processing options.
    """
    try:
        if not request.file_path:
            raise HTTPException(status_code=400, detail="file_path is required")
        
        if not os.path.exists(request.file_path):
            raise HTTPException(status_code=404, detail=f"File not found: {request.file_path}")
        
        # Build processing options
        options = ProcessingOptions(
            extractor_mode=request.extractor_mode,
            chunker_mode=request.chunker_mode,
            merge_window=request.merge_window
        )
        
        # Extract text from PDF
        print(f"[{options.extractor_mode.upper()}] Extracting text from PDF: {request.file_path}")
        pdf_data = await extract_with_options(request.file_path, options)
        
        if not pdf_data["pages"]:
            raise HTTPException(status_code=400, detail="No text content found in PDF")
        
        # Cache the extraction for potential rechunking later
        save_extraction_cache(request.pdf_id, pdf_data, request.filename, request.tags)
        
        # Chunk the document
        print(f"Chunking {len(pdf_data['pages'])} pages with {options.chunker_mode} chunker...")
        base_metadata = {
            "filename": request.filename,
            "total_pages": pdf_data["total_pages"],
            "pdf_title": pdf_data["metadata"].get("title", ""),
            "pdf_author": pdf_data["metadata"].get("author", ""),
        }
        
        chunks = chunk_with_options(pdf_data["pages"], base_metadata, options)
        
        if not chunks:
            raise HTTPException(status_code=400, detail="Could not create chunks from PDF")
        
        # Store in vector database
        print(f"Storing {len(chunks)} chunks in vector store...")
        chunks_added = vector_store.add_documents(
            chunks=chunks,
            pdf_id=request.pdf_id,
            filename=request.filename,
            tags=request.tags
        )
        
        return ProcessResponse(
            success=True,
            pdf_id=request.pdf_id,
            chunks_created=chunks_added,
            message=f"Successfully processed {request.filename}: {chunks_added} chunks created"
        )
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error processing PDF: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/cache/{pdf_id}", response_model=CacheStatusResponse)
async def check_cache_status(pdf_id: str):
    """Check if extraction cache exists for a PDF."""
    cache = load_extraction_cache(pdf_id)
    return CacheStatusResponse(
        pdf_id=pdf_id,
        has_cache=cache is not None,
        filename=cache.get("filename") if cache else None
    )


@app.post("/rechunk/{pdf_id}", response_model=ProcessResponse)
async def rechunk_document(pdf_id: str, request: RechunkRequest):
    """
    Re-chunk a PDF using cached extraction data.
    Skips the extraction phase - only does chunking with new options.
    """
    try:
        # Load cached extraction
        cache = load_extraction_cache(pdf_id)
        if not cache:
            raise HTTPException(
                status_code=404, 
                detail=f"No extraction cache found for PDF {pdf_id}. Run full processing first."
            )
        
        pdf_data = cache["pdf_data"]
        filename = cache["filename"]
        tags = cache["tags"]
        
        if not pdf_data or not pdf_data.get("pages"):
            raise HTTPException(status_code=400, detail="Cached extraction has no page data")
        
        # Build options (only chunking-related options matter here)
        options = ProcessingOptions(
            extractor_mode="text",  # Not used, but needed for options object
            chunker_mode=request.chunker_mode,
            merge_window=request.merge_window
        )
        
        # Delete existing chunks first
        print(f"[Rechunk] Deleting existing chunks for {pdf_id}...")
        vector_store.delete_document(pdf_id)
        
        # Chunk the document with new options
        print(f"[Rechunk] Re-chunking {filename} with {options.chunker_mode} chunker, window={options.merge_window}...")
        base_metadata = {
            "filename": filename,
            "total_pages": pdf_data["total_pages"],
            "pdf_title": pdf_data["metadata"].get("title", ""),
            "pdf_author": pdf_data["metadata"].get("author", ""),
        }
        
        chunks = chunk_with_options(pdf_data["pages"], base_metadata, options)
        
        if not chunks:
            raise HTTPException(status_code=400, detail="Could not create chunks from cached extraction")
        
        # Store in vector database
        print(f"[Rechunk] Storing {len(chunks)} chunks...")
        chunks_added = vector_store.add_documents(
            chunks=chunks,
            pdf_id=pdf_id,
            filename=filename,
            tags=tags
        )
        
        return ProcessResponse(
            success=True,
            pdf_id=pdf_id,
            chunks_created=chunks_added,
            message=f"Successfully rechunked {filename}: {chunks_added} chunks created (skipped extraction)"
        )
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error rechunking PDF: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/query", response_model=QueryResponse)
async def query_documents(request: QueryRequest):
    """
    Query the vector store with optional tag filtering.
    """
    try:
        results = vector_store.query(
            query_text=request.query,
            tags=request.tags,
            top_k=request.top_k,
            pdf_ids=request.pdf_ids
        )
        
        return QueryResponse(
            results=[QueryResult(**r) for r in results],
            query=request.query,
            filters={
                "tags": request.tags,
                "pdf_ids": request.pdf_ids,
                "top_k": request.top_k
            }
        )
        
    except Exception as e:
        print(f"Error querying documents: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/document/{pdf_id}")
async def delete_document(pdf_id: str):
    """
    Delete all chunks associated with a PDF and its extraction cache.
    """
    try:
        deleted_count = vector_store.delete_document(pdf_id)
        # Also delete extraction cache
        delete_extraction_cache(pdf_id)
        return {
            "success": True,
            "pdf_id": pdf_id,
            "chunks_deleted": deleted_count
        }
    except Exception as e:
        print(f"Error deleting document: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.put("/document/{pdf_id}/tags")
async def update_document_tags(pdf_id: str, request: UpdateTagsRequest):
    """
    Update tags for a document.
    """
    try:
        updated_count = vector_store.update_document_tags(pdf_id, request.tags)
        return {
            "success": True,
            "pdf_id": pdf_id,
            "chunks_updated": updated_count,
            "new_tags": request.tags
        }
    except Exception as e:
        print(f"Error updating tags: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/tags")
async def get_all_tags():
    """
    Get all unique tags in the vector store.
    """
    return {
        "tags": vector_store.get_all_tags()
    }


@app.get("/documents")
async def get_all_documents():
    """
    Get all PDF IDs in the vector store.
    """
    return {
        "pdf_ids": vector_store.get_pdf_ids(),
        "total_chunks": vector_store.get_document_count()
    }


@app.get("/stats")
async def get_stats():
    """
    Get vector store statistics.
    """
    return {
        "total_chunks": vector_store.get_document_count(),
        "total_documents": len(vector_store.get_pdf_ids()),
        "available_tags": vector_store.get_all_tags()
    }


@app.get("/chunks/{pdf_id}")
async def get_document_chunks(pdf_id: str, limit: int = 100, offset: int = 0):
    """
    Get all chunks for a specific PDF document.
    Useful for debugging and inspecting the chunking results.
    """
    try:
        chunks = vector_store.get_chunks_by_pdf_id(pdf_id, limit=limit, offset=offset)
        return {
            "pdf_id": pdf_id,
            "total_chunks": len(chunks),
            "offset": offset,
            "limit": limit,
            "chunks": chunks
        }
    except Exception as e:
        print(f"Error getting chunks: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/chunks")
async def get_all_chunks(limit: int = 50, offset: int = 0):
    """
    Get all chunks in the vector store (paginated).
    Useful for debugging.
    """
    try:
        chunks = vector_store.get_all_chunks(limit=limit, offset=offset)
        return {
            "total_in_store": vector_store.get_document_count(),
            "returned": len(chunks),
            "offset": offset,
            "limit": limit,
            "chunks": chunks
        }
    except Exception as e:
        print(f"Error getting chunks: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/clear-all")
async def clear_all_documents():
    """
    Delete all documents from the vector store.
    """
    try:
        deleted_count = vector_store.clear_all()
        return {
            "success": True,
            "deleted_chunks": deleted_count,
            "message": f"Successfully cleared {deleted_count} chunks from vector store"
        }
    except Exception as e:
        print(f"Error clearing vector store: {e}")
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    print(f"Starting RAG service on {HOST}:{PORT}")
    uvicorn.run(app, host=HOST, port=PORT)
