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

# Optional agentic chunker (LLM-driven). Default keeps current behavior.
# Set CHUNKER_MODE=agentic to enable.
CHUNKER_MODE = os.getenv("CHUNKER_MODE", "semantic")  # semantic | agentic

# Uses the same LM Studio streaming endpoint the frontend uses.
AGENTIC_CHUNKER_API_URL = os.getenv(
	"AGENTIC_CHUNKER_API_URL",
	"http://127.0.0.1:8000/chat/regular/stream",
)

# Informational only (the endpoint typically uses the currently-loaded model).
AGENTIC_CHUNKER_MODEL_NAME = os.getenv("AGENTIC_CHUNKER_MODEL_NAME", "qwen3-2507")

# Generation controls for chunk boundary decisions.
AGENTIC_CHUNKER_TEMPERATURE = float(os.getenv("AGENTIC_CHUNKER_TEMPERATURE", "0.2"))
AGENTIC_CHUNKER_LIMIT = int(os.getenv("AGENTIC_CHUNKER_LIMIT", "10000"))

# Safety cap: if a single page exceeds this many chars, agentic mode falls back.
AGENTIC_CHUNKER_MAX_INPUT_CHARS = int(os.getenv("AGENTIC_CHUNKER_MAX_INPUT_CHARS", "9800"))

# Post-chunking merge: sliding window with overlap for more context.
# Value = number of neighbors included on EACH side of center chunk.
# 0 = no merging (chunks stay isolated), 1 = 1 before + 1 after, 3 = 3 before + 3 after
AGENTIC_CHUNK_MERGE_WINDOW = int(os.getenv("AGENTIC_CHUNK_MERGE_WINDOW", "0"))

# =============================================================================
# PDF EXTRACTION CONFIGURATION
# =============================================================================
# Extraction mode: "text" (PyMuPDF) or "vision" (VLM-based OCR)
# - text: Fast, direct text extraction. Best for text-heavy PDFs.
# - vision: Uses vision model to "read" pages. Better for scanned docs, images, complex layouts.
PDF_EXTRACTOR_MODE = os.getenv("PDF_EXTRACTOR_MODE", "text")

# LM Studio base URL for model management (vision mode only)
LM_STUDIO_BASE_URL = os.getenv("LM_STUDIO_BASE_URL", "http://127.0.0.1:8000")

# Vision model for PDF text extraction (OCR + image description)
VISION_MODEL = os.getenv("VISION_MODEL", "qwen3-vl-4b-instruct")

# Text model loaded after vision extraction for agentic chunking
TEXT_MODEL = os.getenv("TEXT_MODEL", "qwen/qwen3-4b-2507")

# Image rendering settings
VISION_DPI = int(os.getenv("VISION_DPI", "150"))  # Balance quality vs size
VISION_MAX_IMAGE_DIM = int(os.getenv("VISION_MAX_IMAGE_DIM", "2048"))

# Retrieval settings
DEFAULT_TOP_K = 8
MAX_TOP_K = 20

# Server settings
HOST = "0.0.0.0"
PORT = 8001

# PDF processing
MAX_FILE_SIZE_MB = 50
SUPPORTED_EXTENSIONS = [".pdf"]
