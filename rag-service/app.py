"""FastAPI RAG service for PDF document retrieval."""

from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import uvicorn
import os

from config import HOST, PORT
from pdf_extractor import extract_text_from_bytes, extract_text_from_pdf
from chunker import semantic_chunker
from vector_store import vector_store

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


# Endpoints
@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "documents_count": vector_store.get_document_count(),
        "available_tags": vector_store.get_all_tags()
    }


@app.post("/process-pdf", response_model=ProcessResponse)
async def process_pdf_file(
    file: UploadFile = File(...),
    pdf_id: str = Form(...),
    filename: str = Form(...),
    tags: str = Form("")  # Comma-separated tags
):
    """
    Process a PDF file: extract text, chunk semantically, and store embeddings.
    """
    try:
        # Read file bytes
        file_bytes = await file.read()
        
        # Parse tags
        tags_list = [t.strip() for t in tags.split(",") if t.strip()]
        
        # Extract text from PDF
        print(f"Extracting text from PDF: {filename}")
        pdf_data = extract_text_from_bytes(file_bytes, filename)
        
        if not pdf_data["pages"]:
            raise HTTPException(status_code=400, detail="No text content found in PDF")
        
        # Chunk the document semantically
        print(f"Chunking {len(pdf_data['pages'])} pages...")
        base_metadata = {
            "filename": filename,
            "total_pages": pdf_data["total_pages"],
            "pdf_title": pdf_data["metadata"].get("title", ""),
            "pdf_author": pdf_data["metadata"].get("author", "")
        }
        
        chunks = semantic_chunker.chunk_pages(pdf_data["pages"], base_metadata)
        
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


@app.post("/process-pdf-path", response_model=ProcessResponse)
async def process_pdf_from_path(request: ProcessPDFRequest):
    """
    Process a PDF file from a server path.
    """
    try:
        if not request.file_path:
            raise HTTPException(status_code=400, detail="file_path is required")
        
        if not os.path.exists(request.file_path):
            raise HTTPException(status_code=404, detail=f"File not found: {request.file_path}")
        
        # Extract text from PDF
        print(f"Extracting text from PDF: {request.file_path}")
        pdf_data = extract_text_from_pdf(request.file_path)
        
        if not pdf_data["pages"]:
            raise HTTPException(status_code=400, detail="No text content found in PDF")
        
        # Chunk the document semantically
        print(f"Chunking {len(pdf_data['pages'])} pages...")
        base_metadata = {
            "filename": request.filename,
            "total_pages": pdf_data["total_pages"],
            "pdf_title": pdf_data["metadata"].get("title", ""),
            "pdf_author": pdf_data["metadata"].get("author", "")
        }
        
        chunks = semantic_chunker.chunk_pages(pdf_data["pages"], base_metadata)
        
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
    Delete all chunks associated with a PDF.
    """
    try:
        deleted_count = vector_store.delete_document(pdf_id)
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
