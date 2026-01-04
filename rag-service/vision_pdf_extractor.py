"""
Vision-based PDF text extraction using LM Studio's vision model.

Supports batch processing:
1. Load vision model ONCE
2. Extract ALL PDFs
3. Load text model ONCE  
4. Chunk ALL documents
"""

import fitz  # PyMuPDF for PDF to image conversion
import base64
import httpx
import os
import json
from typing import Dict, Any, List, Optional, Tuple
from datetime import datetime

from config import (
    LM_STUDIO_BASE_URL,
    VISION_MODEL,
    TEXT_MODEL,
    VISION_DPI,
    VISION_MAX_IMAGE_DIM
)

# Cache directory for extracted text
CACHE_DIR = os.path.join(os.path.dirname(__file__), "cache")
os.makedirs(CACHE_DIR, exist_ok=True)

# Image settings
DPI = VISION_DPI
MAX_IMAGE_DIMENSION = VISION_MAX_IMAGE_DIM


# =============================================================================
# DEBUG/CACHE HELPERS
# =============================================================================

def _save_extracted_text_to_cache(filename: str, pdf_data: Dict[str, Any]) -> str:
    """Save extracted text to cache folder for debugging."""
    try:
        safe_name = "".join(c if c.isalnum() or c in "._-" else "_" for c in filename)
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        cache_filename = f"vision_extracted_{safe_name}_{timestamp}.txt"
        cache_path = os.path.join(CACHE_DIR, cache_filename)
        
        lines = [
            f"=== VISION-EXTRACTED TEXT DEBUG ===",
            f"Filename: {filename}",
            f"Extracted at: {datetime.now().isoformat()}",
            f"Total pages: {pdf_data['total_pages']}",
            f"Metadata: {json.dumps(pdf_data['metadata'], indent=2)}",
            "",
            "=" * 80,
            "FULL TEXT (as sent to chunker):",
            "=" * 80,
            pdf_data['full_text'],
            "",
            "=" * 80,
            "PAGE-BY-PAGE TEXT:",
            "=" * 80,
        ]
        for page in pdf_data['pages']:
            lines.append(f"\n--- PAGE {page['page_num']} ---")
            lines.append(page['text'])
        
        with open(cache_path, 'w', encoding='utf-8') as f:
            f.write("\n".join(lines))
        
        print(f"[Vision Extractor] Saved to: {cache_path}")
        return cache_path
    except Exception as e:
        print(f"[Vision Extractor] Cache save failed: {e}")
        return ""


# =============================================================================
# IMAGE CONVERSION
# =============================================================================

def _pdf_page_to_base64(page: fitz.Page) -> str:
    """Convert a PDF page to a base64-encoded PNG image."""
    mat = fitz.Matrix(DPI / 72, DPI / 72)
    pix = page.get_pixmap(matrix=mat, alpha=False)
    
    # Resize if too large
    if pix.width > MAX_IMAGE_DIMENSION or pix.height > MAX_IMAGE_DIMENSION:
        scale = min(MAX_IMAGE_DIMENSION / pix.width, MAX_IMAGE_DIMENSION / pix.height)
        mat = fitz.Matrix(scale * DPI / 72, scale * DPI / 72)
        pix = page.get_pixmap(matrix=mat, alpha=False)
    
    png_bytes = pix.tobytes("png")
    return base64.b64encode(png_bytes).decode('utf-8')


# =============================================================================
# MODEL MANAGEMENT
# =============================================================================

async def _get_loaded_models(client: httpx.AsyncClient) -> List[str]:
    """Get list of currently loaded models."""
    try:
        response = await client.get(f"{LM_STUDIO_BASE_URL}/models", timeout=10.0)
        if response.status_code == 200:
            data = response.json()
            if isinstance(data, list):
                return [m.get("model") or m.get("id") or str(m) for m in data if m]
            if isinstance(data, dict) and "models" in data:
                return [m.get("model") or m.get("id") or str(m) for m in data["models"] if m]
        return []
    except Exception as e:
        print(f"[Vision Extractor] Error getting models: {e}")
        return []


async def _is_model_loaded(model_name: str, client: httpx.AsyncClient) -> bool:
    """Check if a model is already loaded."""
    loaded = await _get_loaded_models(client)
    for m in loaded:
        if model_name in str(m) or str(m) in model_name:
            return True
    return False


async def _ensure_model_loaded(model_name: str, client: httpx.AsyncClient) -> bool:
    """Load a model only if not already loaded."""
    if await _is_model_loaded(model_name, client):
        print(f"[Vision Extractor] {model_name} already loaded")
        return True
    
    print(f"[Vision Extractor] Loading {model_name}...")
    try:
        response = await client.post(
            f"{LM_STUDIO_BASE_URL}/models/load",
            json={"model_key": model_name, "exclusive": True},
            timeout=120.0
        )
        if response.status_code == 200:
            print(f"[Vision Extractor] {model_name} loaded")
            return True
        print(f"[Vision Extractor] Load failed: {response.text}")
        return False
    except Exception as e:
        print(f"[Vision Extractor] Load error: {e}")
        return False


async def _unload_model(model_name: str, client: httpx.AsyncClient) -> bool:
    """Unload a model."""
    if not await _is_model_loaded(model_name, client):
        return True
    
    print(f"[Vision Extractor] Unloading {model_name}...")
    try:
        response = await client.post(
            f"{LM_STUDIO_BASE_URL}/models/unload",
            json={"model_key": model_name},
            timeout=60.0
        )
        return response.status_code == 200
    except Exception as e:
        print(f"[Vision Extractor] Unload error: {e}")
        return False


# =============================================================================
# VISION EXTRACTION (CORE)
# =============================================================================

async def _extract_page_with_vision(
    page_num: int,
    image_base64: str,
    client: httpx.AsyncClient
) -> str:
    """Use vision model to extract text from a page image."""
    
    prompt = """Look at this document page and output ALL the text content exactly as it appears.

Rules:
1. Preserve the original text layout and structure
2. For images/charts/figures, add a brief description in [square brackets]
3. For tables, output it in markdown formatting Use | column separators and a header separator row (---|---|---). Make sure it's correct.
4. Include headers, footers, page numbers if visible
5. No commentary - just output the content

Output the page content now:"""

    messages = [
        {
            "role": "user",
            "content": prompt,
            "images": [{"data_base64": image_base64, "mime_type": "image/png"}]
        }
    ]
    
    try:
        response = await client.post(
            f"{LM_STUDIO_BASE_URL}/chat/vision/stream",
            json={"messages": messages, "config": {"temperature": 0.1, "maxTokens": 8000}},
            timeout=120.0
        )
        
        if response.status_code != 200:
            print(f"[Vision Extractor] Page {page_num} error: {response.status_code}")
            return f"[Error extracting page {page_num}]"
        
        # Collect NDJSON stream
        extracted_text = ""
        for line in response.text.strip().split('\n'):
            line = line.strip()
            if not line:
                continue
            try:
                data = json.loads(line)
                if "content" in data:
                    extracted_text += data["content"]
            except json.JSONDecodeError:
                continue
        
        print(f"[Vision Extractor] Page {page_num}: {len(extracted_text)} chars")
        return extracted_text.strip()
        
    except Exception as e:
        print(f"[Vision Extractor] Page {page_num} exception: {e}")
        return f"[Error extracting page {page_num}: {str(e)}]"


async def _extract_single_pdf(
    doc: fitz.Document,
    filename: str,
    client: httpx.AsyncClient
) -> Dict[str, Any]:
    """Extract text from a single PDF (assumes vision model already loaded)."""
    
    total_pages = len(doc)
    metadata = doc.metadata or {}
    pages = []
    full_text_parts = []
    
    for page_num in range(total_pages):
        print(f"[Vision Extractor] {filename} - Page {page_num + 1}/{total_pages}")
        
        page = doc[page_num]
        image_base64 = _pdf_page_to_base64(page)
        text = await _extract_page_with_vision(page_num + 1, image_base64, client)
        
        if text and not text.startswith("[Error"):
            pages.append({"page_num": page_num + 1, "text": text})
            full_text_parts.append(text)
    
    result = {
        "pages": pages,
        "total_pages": total_pages,
        "metadata": {
            "title": metadata.get("title", "") or filename,
            "author": metadata.get("author", ""),
            "subject": metadata.get("subject", ""),
            "creator": metadata.get("creator", ""),
            "creation_date": metadata.get("creationDate", ""),
        },
        "full_text": "\n\n".join(full_text_parts)
    }
    
    _save_extracted_text_to_cache(filename, result)
    return result


# =============================================================================
# SINGLE PDF PROCESSING (backwards compatible)
# =============================================================================

async def extract_text_with_vision(file_path: str) -> Dict[str, Any]:
    """Extract text from a PDF file using vision model."""
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"PDF not found: {file_path}")
    
    filename = os.path.basename(file_path)
    print(f"[Vision Extractor] Processing: {filename}")
    
    doc = fitz.open(file_path)
    
    async with httpx.AsyncClient() as client:
        await _ensure_model_loaded(VISION_MODEL, client)
        result = await _extract_single_pdf(doc, filename, client)
        # Switch to text model for chunking
        await _unload_model(VISION_MODEL, client)
        await _ensure_model_loaded(TEXT_MODEL, client)
    
    doc.close()
    return result


async def extract_text_from_bytes_with_vision(
    file_bytes: bytes, 
    filename: str = "document.pdf"
) -> Dict[str, Any]:
    """Extract text from PDF bytes using vision model."""
    print(f"[Vision Extractor] Processing: {filename}")
    
    doc = fitz.open(stream=file_bytes, filetype="pdf")
    
    async with httpx.AsyncClient() as client:
        await _ensure_model_loaded(VISION_MODEL, client)
        result = await _extract_single_pdf(doc, filename, client)
        # Switch to text model for chunking
        await _unload_model(VISION_MODEL, client)
        await _ensure_model_loaded(TEXT_MODEL, client)
    
    doc.close()
    return result


# =============================================================================
# BATCH PROCESSING
# =============================================================================

class BatchVisionExtractor:
    """
    Batch processor for multiple PDFs.
    
    Usage:
        async with BatchVisionExtractor() as extractor:
            # Phase 1: Extract all PDFs (vision model loaded once)
            for pdf_bytes, filename in pdfs:
                pdf_data = await extractor.extract(pdf_bytes, filename)
                extracted_results.append(pdf_data)
            
            # Phase 2: Switch to text model (done automatically)
            await extractor.prepare_for_chunking()
            
            # Now chunk all results with text model loaded
    """
    
    def __init__(self):
        self.client: Optional[httpx.AsyncClient] = None
        self._vision_loaded = False
        self._text_loaded = False
    
    async def __aenter__(self):
        self.client = httpx.AsyncClient()
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self.client:
            await self.client.aclose()
        return False
    
    async def _ensure_vision_model(self):
        """Load vision model if not already loaded."""
        if not self._vision_loaded:
            await _ensure_model_loaded(VISION_MODEL, self.client)
            self._vision_loaded = True
            self._text_loaded = False
    
    async def extract(self, file_bytes: bytes, filename: str) -> Dict[str, Any]:
        """Extract text from a single PDF (vision model stays loaded)."""
        await self._ensure_vision_model()
        
        doc = fitz.open(stream=file_bytes, filetype="pdf")
        try:
            result = await _extract_single_pdf(doc, filename, self.client)
            return result
        finally:
            doc.close()
    
    async def extract_from_path(self, file_path: str) -> Dict[str, Any]:
        """Extract text from a PDF file path."""
        await self._ensure_vision_model()
        
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"PDF not found: {file_path}")
        
        filename = os.path.basename(file_path)
        doc = fitz.open(file_path)
        try:
            result = await _extract_single_pdf(doc, filename, self.client)
            return result
        finally:
            doc.close()
    
    async def prepare_for_chunking(self):
        """Switch from vision model to text model for chunking phase."""
        if self._vision_loaded and not self._text_loaded:
            print("[Vision Extractor] Switching to text model for chunking...")
            await _unload_model(VISION_MODEL, self.client)
            await _ensure_model_loaded(TEXT_MODEL, self.client)
            self._vision_loaded = False
            self._text_loaded = True


async def batch_extract_pdfs(
    pdf_items: List[Tuple[bytes, str]]
) -> List[Dict[str, Any]]:
    """
    Extract text from multiple PDFs efficiently.
    
    Args:
        pdf_items: List of (file_bytes, filename) tuples
        
    Returns:
        List of extraction results in same order
    """
    results = []
    
    async with BatchVisionExtractor() as extractor:
        # Phase 1: Extract all with vision model
        for file_bytes, filename in pdf_items:
            print(f"[Batch] Extracting: {filename}")
            result = await extractor.extract(file_bytes, filename)
            results.append(result)
        
        # Phase 2: Switch to text model
        await extractor.prepare_for_chunking()
    
    return results
