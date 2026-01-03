"""Configuration settings for the RAG service."""

import os

# =============================================================================
# EMBEDDING MODEL CONFIGURATION
# =============================================================================
# Change this to switch embedding models. Options:
#   - "intfloat/multilingual-e5-large-instruct"  (multilingual, ~2.2GB, 1024 dim)
#   - "Qwen/Qwen3-Embedding-0.6B"                (multilingual, ~2.4GB, 1024 dim)
#   - "Qwen/Qwen3-Embedding-4B"                  (multilingual, ~8GB, 2560 dim)
#   - "sentence-transformers/all-MiniLM-L6-v2"   (English only, ~90MB, 384 dim)
#   - "BAAI/bge-large-en-v1.5"                   (English, ~1.3GB, 1024 dim)
# =============================================================================
EMBEDDING_MODEL = "intfloat/multilingual-e5-large-instruct"

# E5 models require specific prefixes for queries and documents
# Set to True for intfloat/e5-* or intfloat/multilingual-e5-* models
E5_MODEL = True
E5_QUERY_PREFIX = "query: "
E5_DOCUMENT_PREFIX = "passage: "

# ChromaDB settings
CHROMA_PERSIST_DIR = os.path.join(os.path.dirname(__file__), "chroma_db")
COLLECTION_NAME = "pdf_documents"

# Chunking settings
CHUNK_BREAKPOINT_THRESHOLD_TYPE = "percentile"  # percentile, standard_deviation, interquartile
CHUNK_BREAKPOINT_THRESHOLD = 85  # Higher = fewer, larger chunks (more context preserved)

# Retrieval settings
DEFAULT_TOP_K = 5
MAX_TOP_K = 20

# Server settings
HOST = "0.0.0.0"
PORT = 8001

# PDF processing
MAX_FILE_SIZE_MB = 50
SUPPORTED_EXTENSIONS = [".pdf"]
