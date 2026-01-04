"""PDF text extraction using PyMuPDF."""

import fitz  # PyMuPDF
from typing import List, Dict, Any
import os
import json
from datetime import datetime

# Cache directory for extracted text
CACHE_DIR = os.path.join(os.path.dirname(__file__), "cache")
os.makedirs(CACHE_DIR, exist_ok=True)

def _save_extracted_text_to_cache(filename: str, pdf_data: Dict[str, Any]) -> str:
    """
    Save extracted text to cache folder for debugging.
    Returns the path to the saved file.
    """
    try:
        # Create safe filename
        safe_name = "".join(c if c.isalnum() or c in "._-" else "_" for c in filename)
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        cache_filename = f"extracted_{safe_name}_{timestamp}.txt"
        cache_path = os.path.join(CACHE_DIR, cache_filename)
        
        # Build debug content
        lines = []
        lines.append(f"=== EXTRACTED TEXT DEBUG ===")
        lines.append(f"Filename: {filename}")
        lines.append(f"Extracted at: {datetime.now().isoformat()}")
        lines.append(f"Total pages: {pdf_data['total_pages']}")
        lines.append(f"Metadata: {json.dumps(pdf_data['metadata'], indent=2)}")
        lines.append("")
        lines.append("=" * 80)
        lines.append("FULL TEXT (as sent to chunker):")
        lines.append("=" * 80)
        lines.append(pdf_data['full_text'])
        lines.append("")
        lines.append("=" * 80)
        lines.append("PAGE-BY-PAGE TEXT:")
        lines.append("=" * 80)
        for page in pdf_data['pages']:
            lines.append(f"\n--- PAGE {page['page_num']} ---")
            lines.append(page['text'])
        
        with open(cache_path, 'w', encoding='utf-8') as f:
            f.write("\n".join(lines))
        
        print(f"[PDF Extractor] Saved extracted text to: {cache_path}")
        return cache_path
    except Exception as e:
        print(f"[PDF Extractor] Warning: Could not save extracted text to cache: {e}")
        return ""


def extract_text_from_pdf(file_path: str) -> Dict[str, Any]:
    """
    Extract text from a PDF file with page-level granularity.
    
    Args:
        file_path: Path to the PDF file
        
    Returns:
        Dictionary with:
            - pages: List of {page_num, text}
            - total_pages: Total number of pages
            - metadata: PDF metadata
            - full_text: Concatenated text from all pages
    """
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"PDF file not found: {file_path}")
    
    try:
        doc = fitz.open(file_path)
        
        pages = []
        full_text_parts = []
        total_pages = len(doc)
        
        for page_num in range(total_pages):
            page = doc[page_num]
            text = page.get_text("text")
            
            # Clean up text
            text = text.strip()
            
            if text:
                pages.append({
                    "page_num": page_num + 1,  # 1-indexed
                    "text": text
                })
                full_text_parts.append(text)
        
        # Get PDF metadata
        metadata = doc.metadata or {}
        
        result = {
            "pages": pages,
            "total_pages": total_pages,
            "metadata": {
                "title": metadata.get("title", ""),
                "author": metadata.get("author", ""),
                "subject": metadata.get("subject", ""),
                "creator": metadata.get("creator", ""),
                "creation_date": metadata.get("creationDate", ""),
            },
            "full_text": "\n\n".join(full_text_parts)
        }
        
        doc.close()
        
        # Save extracted text to cache for debugging
        _save_extracted_text_to_cache(os.path.basename(file_path), result)
        
        return result
        
    except Exception as e:
        raise Exception(f"Error extracting text from PDF: {str(e)}")


def extract_text_from_bytes(file_bytes: bytes, filename: str = "document.pdf") -> Dict[str, Any]:
    """
    Extract text from PDF bytes.
    
    Args:
        file_bytes: PDF file as bytes
        filename: Original filename for metadata
        
    Returns:
        Same structure as extract_text_from_pdf
    """
    try:
        doc = fitz.open(stream=file_bytes, filetype="pdf")
        
        pages = []
        full_text_parts = []
        
        for page_num in range(len(doc)):
            page = doc[page_num]
            text = page.get_text("text")
            text = text.strip()
            
            if text:
                pages.append({
                    "page_num": page_num + 1,
                    "text": text
                })
                full_text_parts.append(text)
        
        metadata = doc.metadata or {}
        total_pages = len(doc)
        doc.close()
        
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
        
        # Save extracted text to cache for debugging
        _save_extracted_text_to_cache(filename, result)
        
        return result
        
    except Exception as e:
        raise Exception(f"Error extracting text from PDF bytes: {str(e)}")
