"""Semantic chunking using LangChain's SemanticChunker."""

from typing import List, Dict, Any
from langchain_experimental.text_splitter import SemanticChunker
from langchain_text_splitters import RecursiveCharacterTextSplitter
from embeddings import embedding_model
from config import CHUNK_BREAKPOINT_THRESHOLD_TYPE, CHUNK_BREAKPOINT_THRESHOLD


class SemanticDocumentChunker:
    """Semantic chunker that preserves context using embeddings."""
    
    def __init__(self):
        self.semantic_chunker = None
        self._initialize_chunker()
        
        # Fallback chunker for very long documents or when semantic fails
        self.fallback_chunker = RecursiveCharacterTextSplitter(
            chunk_size=1000,
            chunk_overlap=200,
            separators=["\n\n", "\n", ". ", " ", ""]
        )
    
    def _initialize_chunker(self):
        """Initialize the semantic chunker with the embedding model."""
        try:
            self.semantic_chunker = SemanticChunker(
                embeddings=embedding_model.model,
                breakpoint_threshold_type=CHUNK_BREAKPOINT_THRESHOLD_TYPE,
                breakpoint_threshold_amount=CHUNK_BREAKPOINT_THRESHOLD
            )
            print("Semantic chunker initialized")
        except Exception as e:
            print(f"Warning: Could not initialize semantic chunker: {e}")
            print("Will use fallback recursive chunker")
    
    def chunk_text(self, text: str, metadata: Dict[str, Any] = None) -> List[Dict[str, Any]]:
        """
        Split text into semantic chunks.
        
        Args:
            text: The document text to chunk
            metadata: Base metadata to include with each chunk
            
        Returns:
            List of chunk dictionaries with text and metadata
        """
        if not text or not text.strip():
            return []
        
        metadata = metadata or {}
        chunks = []
        
        try:
            # Try semantic chunking first
            if self.semantic_chunker:
                raw_chunks = self.semantic_chunker.split_text(text)
            else:
                raw_chunks = self.fallback_chunker.split_text(text)
            
            # If chunks are too large, apply secondary splitting
            processed_chunks = []
            for chunk in raw_chunks:
                if len(chunk) > 2000:  # If chunk is too large
                    sub_chunks = self.fallback_chunker.split_text(chunk)
                    processed_chunks.extend(sub_chunks)
                else:
                    processed_chunks.append(chunk)
            
            # Build chunk objects with metadata
            for i, chunk_text in enumerate(processed_chunks):
                chunk_text = chunk_text.strip()
                if chunk_text:  # Skip empty chunks
                    chunk_obj = {
                        "text": chunk_text,
                        "metadata": {
                            **metadata,
                            "chunk_index": i,
                            "chunk_total": len(processed_chunks),
                            "char_count": len(chunk_text)
                        }
                    }
                    chunks.append(chunk_obj)
            
            print(f"Created {len(chunks)} semantic chunks from document")
            return chunks
            
        except Exception as e:
            print(f"Error in semantic chunking: {e}")
            # Fallback to recursive chunking
            try:
                raw_chunks = self.fallback_chunker.split_text(text)
                for i, chunk_text in enumerate(raw_chunks):
                    chunk_text = chunk_text.strip()
                    if chunk_text:
                        chunk_obj = {
                            "text": chunk_text,
                            "metadata": {
                                **metadata,
                                "chunk_index": i,
                                "chunk_total": len(raw_chunks),
                                "char_count": len(chunk_text),
                                "chunking_method": "fallback"
                            }
                        }
                        chunks.append(chunk_obj)
                return chunks
            except Exception as e2:
                print(f"Fallback chunking also failed: {e2}")
                return []
    
    def chunk_pages(self, pages: List[Dict[str, Any]], base_metadata: Dict[str, Any] = None) -> List[Dict[str, Any]]:
        """
        Chunk a list of pages (from PDF extraction).
        
        Args:
            pages: List of {"page_num": int, "text": str}
            base_metadata: Base metadata for all chunks
            
        Returns:
            List of chunk dictionaries
        """
        base_metadata = base_metadata or {}
        all_chunks = []
        
        for page in pages:
            page_num = page.get("page_num", 0)
            page_text = page.get("text", "")
            
            if not page_text.strip():
                continue
            
            page_metadata = {
                **base_metadata,
                "page_num": page_num
            }
            
            page_chunks = self.chunk_text(page_text, page_metadata)
            all_chunks.extend(page_chunks)
        
        # Re-index all chunks
        for i, chunk in enumerate(all_chunks):
            chunk["metadata"]["global_chunk_index"] = i
        
        return all_chunks


# Global instance
semantic_chunker = SemanticDocumentChunker()
