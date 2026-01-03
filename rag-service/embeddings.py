"""Embedding model wrapper with support for multiple models."""

import torch
from typing import List
from langchain_huggingface import HuggingFaceEmbeddings
from config import EMBEDDING_MODEL, E5_MODEL, E5_QUERY_PREFIX, E5_DOCUMENT_PREFIX

class EmbeddingModel:
    """Singleton wrapper for the embedding model."""
    
    _instance = None
    _model = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance
    
    def __init__(self):
        if self._model is None:
            print(f"Loading embedding model: {EMBEDDING_MODEL}")
            
            # Determine device
            if torch.cuda.is_available():
                device = "cuda"
                print(f"Using CUDA: {torch.cuda.get_device_name(0)}")
            else:
                device = "cpu"
                print("Using CPU (CUDA not available)")
            
            # Initialize HuggingFace embeddings
            self._model = HuggingFaceEmbeddings(
                model_name=EMBEDDING_MODEL,
                model_kwargs={
                    "device": device,
                    "trust_remote_code": True
                },
                encode_kwargs={
                    "normalize_embeddings": True,  # For cosine similarity
                    "batch_size": 32
                }
            )
            print("Embedding model loaded successfully")
    
    @property
    def model(self) -> HuggingFaceEmbeddings:
        return self._model
    
    def embed_documents(self, texts: List[str]) -> List[List[float]]:
        """Generate embeddings for a list of documents."""
        if E5_MODEL:
            # E5 models require "passage: " prefix for documents
            texts = [f"{E5_DOCUMENT_PREFIX}{text}" for text in texts]
        return self._model.embed_documents(texts)
    
    def embed_query(self, text: str) -> List[float]:
        """Generate embedding for a single query."""
        if E5_MODEL:
            # E5 models require "query: " prefix for queries
            text = f"{E5_QUERY_PREFIX}{text}"
        return self._model.embed_query(text)


# Global instance
embedding_model = EmbeddingModel()
