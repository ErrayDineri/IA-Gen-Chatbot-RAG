"""ChromaDB vector store operations with tag filtering."""

import chromadb
from chromadb.config import Settings
from typing import List, Dict, Any, Optional
import os
from embeddings import embedding_model
from config import CHROMA_PERSIST_DIR, COLLECTION_NAME, DEFAULT_TOP_K, MAX_TOP_K


class VectorStore:
    """ChromaDB vector store with tag-based filtering."""
    
    def __init__(self):
        # Ensure persist directory exists
        os.makedirs(CHROMA_PERSIST_DIR, exist_ok=True)
        
        # Initialize ChromaDB client with persistence
        self.client = chromadb.PersistentClient(
            path=CHROMA_PERSIST_DIR,
            settings=Settings(
                anonymized_telemetry=False,
                allow_reset=True
            )
        )
        
        # Get or create collection
        self.collection = self.client.get_or_create_collection(
            name=COLLECTION_NAME,
            metadata={"hnsw:space": "cosine"}  # Use cosine similarity
        )
        
        print(f"Vector store initialized. Collection: {COLLECTION_NAME}, Documents: {self.collection.count()}")
    
    def clear_all(self) -> int:
        """
        Delete all documents from the vector store.
        
        Returns:
            Number of documents deleted
        """
        count = self.collection.count()
        
        # Delete the collection and recreate it
        self.client.delete_collection(name=COLLECTION_NAME)
        self.collection = self.client.get_or_create_collection(
            name=COLLECTION_NAME,
            metadata={"hnsw:space": "cosine"}
        )
        
        print(f"Cleared all {count} documents from vector store")
        return count
    
    def add_documents(
        self,
        chunks: List[Dict[str, Any]],
        pdf_id: str,
        filename: str,
        tags: List[str]
    ) -> int:
        """
        Add document chunks to the vector store.
        
        Args:
            chunks: List of {"text": str, "metadata": dict}
            pdf_id: Unique PDF identifier
            filename: Original filename
            tags: List of tags for filtering
            
        Returns:
            Number of chunks added
        """
        if not chunks:
            return 0
        
        # Prepare data for ChromaDB
        ids = []
        documents = []
        metadatas = []
        
        for i, chunk in enumerate(chunks):
            chunk_id = f"{pdf_id}_chunk_{i}"
            
            # Build metadata (ChromaDB requires flat structure)
            metadata = {
                "pdf_id": pdf_id,
                "filename": filename,
                "tags": ",".join(tags) if tags else "",  # Store as comma-separated string
                "chunk_index": chunk["metadata"].get("chunk_index", i),
                "page_num": chunk["metadata"].get("page_num", 0),
                "char_count": chunk["metadata"].get("char_count", len(chunk["text"]))
            }
            
            ids.append(chunk_id)
            documents.append(chunk["text"])
            metadatas.append(metadata)
        
        # Generate embeddings
        print(f"Generating embeddings for {len(documents)} chunks...")
        embeddings = embedding_model.embed_documents(documents)
        
        # Add to ChromaDB
        self.collection.add(
            ids=ids,
            documents=documents,
            embeddings=embeddings,
            metadatas=metadatas
        )
        
        print(f"Added {len(chunks)} chunks to vector store")
        return len(chunks)
    
    def query(
        self,
        query_text: str,
        tags: Optional[List[str]] = None,
        top_k: int = DEFAULT_TOP_K,
        pdf_ids: Optional[List[str]] = None
    ) -> List[Dict[str, Any]]:
        """
        Query the vector store with optional tag filtering.
        
        Args:
            query_text: The query string
            tags: Optional list of tags to filter by (OR logic)
            top_k: Number of results to return
            pdf_ids: Optional list of specific PDF IDs to search
            
        Returns:
            List of results with text, metadata, and similarity score
        """
        top_k = min(top_k, MAX_TOP_K)
        
        # Generate query embedding
        query_embedding = embedding_model.embed_query(query_text)
        
        # Build where filter
        where_filter = None
        where_conditions = []
        
        if tags and len(tags) > 0:
            # Filter by tags (documents that contain any of the specified tags)
            tag_conditions = []
            for tag in tags:
                tag_conditions.append({"tags": {"$contains": tag}})
            
            if len(tag_conditions) == 1:
                where_conditions.append(tag_conditions[0])
            else:
                where_conditions.append({"$or": tag_conditions})
        
        if pdf_ids and len(pdf_ids) > 0:
            # Filter by specific PDF IDs
            if len(pdf_ids) == 1:
                where_conditions.append({"pdf_id": pdf_ids[0]})
            else:
                where_conditions.append({"$or": [{"pdf_id": pid} for pid in pdf_ids]})
        
        # Combine conditions
        if len(where_conditions) == 1:
            where_filter = where_conditions[0]
        elif len(where_conditions) > 1:
            where_filter = {"$and": where_conditions}
        
        # Query ChromaDB
        try:
            results = self.collection.query(
                query_embeddings=[query_embedding],
                n_results=top_k,
                where=where_filter,
                include=["documents", "metadatas", "distances"]
            )
        except Exception as e:
            print(f"Query error: {e}")
            # Try without filter if filter fails
            results = self.collection.query(
                query_embeddings=[query_embedding],
                n_results=top_k,
                include=["documents", "metadatas", "distances"]
            )
        
        # Format results
        formatted_results = []
        if results and results["ids"] and len(results["ids"]) > 0:
            for i, doc_id in enumerate(results["ids"][0]):
                # Convert distance to similarity score (cosine distance to similarity)
                distance = results["distances"][0][i] if results["distances"] else 0
                similarity = 1 - distance  # Cosine similarity
                
                formatted_results.append({
                    "id": doc_id,
                    "text": results["documents"][0][i],
                    "metadata": results["metadatas"][0][i],
                    "similarity": round(similarity, 4)
                })
        
        return formatted_results
    
    def delete_document(self, pdf_id: str) -> int:
        """
        Delete all chunks associated with a PDF.
        
        Args:
            pdf_id: The PDF identifier
            
        Returns:
            Number of chunks deleted
        """
        # Get all chunk IDs for this PDF
        try:
            results = self.collection.get(
                where={"pdf_id": pdf_id},
                include=[]
            )
            
            if results and results["ids"]:
                chunk_ids = results["ids"]
                self.collection.delete(ids=chunk_ids)
                print(f"Deleted {len(chunk_ids)} chunks for PDF {pdf_id}")
                return len(chunk_ids)
            
            return 0
        except Exception as e:
            print(f"Error deleting document: {e}")
            return 0
    
    def update_document_tags(self, pdf_id: str, new_tags: List[str]) -> int:
        """
        Update tags for all chunks of a document.
        
        Args:
            pdf_id: The PDF identifier
            new_tags: New list of tags
            
        Returns:
            Number of chunks updated
        """
        try:
            results = self.collection.get(
                where={"pdf_id": pdf_id},
                include=["metadatas"]
            )
            
            if results and results["ids"]:
                tags_str = ",".join(new_tags) if new_tags else ""
                
                # Update each chunk's metadata
                for i, chunk_id in enumerate(results["ids"]):
                    current_metadata = results["metadatas"][i]
                    current_metadata["tags"] = tags_str
                    
                    self.collection.update(
                        ids=[chunk_id],
                        metadatas=[current_metadata]
                    )
                
                print(f"Updated tags for {len(results['ids'])} chunks")
                return len(results["ids"])
            
            return 0
        except Exception as e:
            print(f"Error updating tags: {e}")
            return 0
    
    def get_all_tags(self) -> List[str]:
        """Get all unique tags in the vector store."""
        try:
            results = self.collection.get(include=["metadatas"])
            
            tags_set = set()
            if results and results["metadatas"]:
                for metadata in results["metadatas"]:
                    tags_str = metadata.get("tags", "")
                    if tags_str:
                        for tag in tags_str.split(","):
                            tag = tag.strip()
                            if tag:
                                tags_set.add(tag)
            
            return sorted(list(tags_set))
        except Exception as e:
            print(f"Error getting tags: {e}")
            return []
    
    def get_document_count(self) -> int:
        """Get total number of chunks in the store."""
        return self.collection.count()
    
    def get_pdf_ids(self) -> List[str]:
        """Get all unique PDF IDs in the store."""
        try:
            results = self.collection.get(include=["metadatas"])
            
            pdf_ids = set()
            if results and results["metadatas"]:
                for metadata in results["metadatas"]:
                    pdf_id = metadata.get("pdf_id")
                    if pdf_id:
                        pdf_ids.add(pdf_id)
            
            return sorted(list(pdf_ids))
        except Exception as e:
            print(f"Error getting PDF IDs: {e}")
            return []


# Global instance
vector_store = VectorStore()
