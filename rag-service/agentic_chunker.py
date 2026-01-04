"""Agentic chunker using an LLM for intelligent document splitting.

Simple approach:
1. Ask LLM to identify document sections with anchor_text
2. Find exact anchor positions in the text
3. Chunk between anchors - done!
"""

from __future__ import annotations

from dataclasses import dataclass
import hashlib
import json
import logging
import os
import re
import sqlite3
import time
from typing import Any, Dict, List, Optional, Tuple

import requests
from langchain_text_splitters import RecursiveCharacterTextSplitter

from config import (
    AGENTIC_CHUNKER_API_URL,
    AGENTIC_CHUNKER_MODEL_NAME,
    AGENTIC_CHUNKER_TEMPERATURE,
    AGENTIC_CHUNKER_LIMIT,
    AGENTIC_CHUNK_MERGE_WINDOW,
)


LOG = logging.getLogger("agentic_chunker")

# Debug logging
AGENTIC_CHUNKER_DEBUG = str(os.getenv("AGENTIC_CHUNKER_DEBUG", "1")).strip() != "0"
_DEBUG_LOG_PATH = os.path.join(os.path.dirname(__file__), "cache", "agentic_tool_calls.jsonl")

if AGENTIC_CHUNKER_DEBUG:
    LOG.warning("[Agentic][debug] enabled; tool call log: %s", _DEBUG_LOG_PATH)
    print(f"[Agentic][debug] enabled; tool call log: {_DEBUG_LOG_PATH}")

# Defaults
AGENTIC_CHUNKER_RETRIES = 2
AGENTIC_CHUNKER_TIMEOUT = 90

PROMPT_VERSION = "v3-clean-2026-01-03"

JSON_START = "<JSON_START>"
JSON_END = "<JSON_END>"


# =============================================================================
# CACHING
# =============================================================================

class SQLiteJsonCache:
    """Persistent cache using SQLite."""

    def __init__(self, db_path: str):
        self.db_path = db_path
        os.makedirs(os.path.dirname(db_path), exist_ok=True)
        self._init_db()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.execute("PRAGMA journal_mode=WAL")
        return conn

    def _init_db(self) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS cache (
                    key TEXT PRIMARY KEY,
                    value_json TEXT NOT NULL,
                    created_at INTEGER NOT NULL
                )
                """
            )

    def get(self, key: str) -> Optional[dict]:
        with self._connect() as conn:
            cur = conn.execute("SELECT value_json FROM cache WHERE key = ?", (key,))
            row = cur.fetchone()
            if not row:
                return None
            try:
                obj = json.loads(row[0])
                return obj if isinstance(obj, dict) else None
            except Exception:
                return None

    def set(self, key: str, value: dict) -> None:
        if not isinstance(value, dict):
            return
        payload = json.dumps(value, ensure_ascii=False)
        with self._connect() as conn:
            conn.execute(
                "INSERT OR REPLACE INTO cache(key, value_json, created_at) VALUES(?, ?, ?)",
                (key, payload, int(time.time())),
            )


_CACHE_DB_PATH = os.path.join(os.path.dirname(__file__), "cache", "agentic_chunker.sqlite3")
_PERSISTENT_CACHE = SQLiteJsonCache(_CACHE_DB_PATH)


def _stable_hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _cache_key(text: str) -> str:
    return _stable_hash(f"{PROMPT_VERSION}|{AGENTIC_CHUNKER_MODEL_NAME}|{text}")


# =============================================================================
# ANCHOR FINDING
# =============================================================================

def _find_anchor(full_text: str, anchor_text: str, start_hint: int = 0) -> int:
    """Find exact position of anchor_text in full_text."""
    if not anchor_text:
        return -1
    anchor_text = anchor_text.strip()
    if not anchor_text:
        return -1
    
    # Exact match
    pos = full_text.find(anchor_text, max(0, start_hint))
    if pos != -1:
        return pos
    
    # Try with collapsed whitespace
    compact_anchor = re.sub(r"\s+", " ", anchor_text)
    compact_full = re.sub(r"\s+", " ", full_text)
    compact_pos = compact_full.find(compact_anchor, max(0, start_hint))
    if compact_pos == -1:
        return -1
    
    # Map back to original text using first token
    token = compact_anchor.split(" ")[0]
    if token:
        return full_text.find(token, max(0, start_hint))
    return -1


# =============================================================================
# PAGE UTILITIES
# =============================================================================

def _iter_page_spans(pages: List[Dict[str, Any]], separator: str = "\n\n") -> Tuple[str, List[Dict[str, int]]]:
    """Join pages into one text and return page spans."""
    parts: List[str] = []
    spans: List[Dict[str, int]] = []
    cursor = 0
    for idx, page in enumerate(pages):
        page_num = int(page.get("page_num", idx + 1) or (idx + 1))
        page_text = str(page.get("text", "") or "").strip("\n")
        if idx > 0:
            parts.append(separator)
            cursor += len(separator)
        start = cursor
        parts.append(page_text)
        cursor += len(page_text)
        spans.append({"page_num": page_num, "start": start, "end": cursor})
    return "".join(parts), spans


def _pages_for_range(page_spans: List[Dict[str, int]], start: int, end: int) -> Tuple[int, int]:
    """Return (page_start, page_end) for a text range."""
    start_page = 0
    end_page = 0
    for span in page_spans:
        s0, s1 = span["start"], span["end"]
        if start_page == 0 and start < s1 and end > s0:
            start_page = span["page_num"]
        if start < s1 and end > s0:
            end_page = span["page_num"]
    if start_page == 0 and page_spans:
        start_page = page_spans[0]["page_num"]
    if end_page == 0 and page_spans:
        end_page = page_spans[-1]["page_num"]
    return start_page, end_page


def _merge_adjacent_chunks(chunks: List[Dict[str, Any]], window: int) -> List[Dict[str, Any]]:
    """
    Merge chunks using a sliding window with overlap.
    
    Each output chunk is centered on an original chunk, combined with
    'window' neighbors before and 'window' neighbors after.
    
    With window=2, for chunks [1,2,3,4,5,6,7]:
    - Output 1: orig[1,2,3]         (center=1, 0 before, 2 after)
    - Output 2: orig[1,2,3,4]       (center=2, 1 before, 2 after)
    - Output 3: orig[1,2,3,4,5]     (center=3, 2 before, 2 after)
    - Output 4: orig[2,3,4,5,6]     (center=4, 2 before, 2 after)
    - Output 5: orig[3,4,5,6,7]     (center=5, 2 before, 2 after)
    - Output 6: orig[4,5,6,7]       (center=6, 2 before, 1 after)
    - Output 7: orig[5,6,7]         (center=7, 2 before, 0 after)
    
    This creates overlapping context - neighboring chunks share content.
    """
    if window < 1 or len(chunks) == 0:
        return chunks
    
    merged = []
    n = len(chunks)
    
    for center_idx in range(n):
        # Calculate window bounds (from originals)
        start_idx = max(0, center_idx - window)
        end_idx = min(n, center_idx + window + 1)  # +1 for slice
        
        group = chunks[start_idx:end_idx]
        center_chunk = chunks[center_idx]
        
        if len(group) == 1:
            # No neighbors, just copy the chunk
            merged.append({
                "text": center_chunk["text"],
                "metadata": {
                    **center_chunk.get("metadata", {}),
                    "center_section": center_idx,
                    "context_range": f"{start_idx + 1}-{end_idx}",
                }
            })
        else:
            # Combine texts in order
            combined_text = "\n\n".join(c["text"] for c in group)
            
            # Use center chunk's title as primary, note context range
            center_title = center_chunk["metadata"].get("chunk_title", "")
            
            # Get start/end positions
            first_meta = group[0].get("metadata", {})
            last_meta = group[-1].get("metadata", {})
            
            merged_chunk = {
                "text": combined_text,
                "metadata": {
                    **center_chunk.get("metadata", {}),
                    "chunk_title": center_title,
                    "start": first_meta.get("start", 0),
                    "end": last_meta.get("end", 0),
                    "center_section": center_idx,
                    "context_range": f"{start_idx + 1}-{end_idx}",
                    "sections_included": end_idx - start_idx,
                }
            }
            merged.append(merged_chunk)
    
    LOG.info("[Agentic] Created %d overlapping chunks from %d sections (window=%d)", len(merged), n, window)
    print(f"[Agentic] Created {len(merged)} overlapping chunks from {n} sections (window={window})")
    
    return merged


# =============================================================================
# LLM TOOL INVOKER
# =============================================================================

@dataclass
class ToolInvoker:
    """Handles LLM API calls with retries and JSON extraction."""
    
    api_url: str
    timeout: int = AGENTIC_CHUNKER_TIMEOUT
    retries: int = AGENTIC_CHUNKER_RETRIES
    temperature: float = AGENTIC_CHUNKER_TEMPERATURE
    limit: int = AGENTIC_CHUNKER_LIMIT
    model_name: str = AGENTIC_CHUNKER_MODEL_NAME

    def _make_payload(self, messages: List[Dict[str, str]]) -> Dict[str, Any]:
        config: Dict[str, Any] = {"temperature": self.temperature, "maxTokens": self.limit}
        if self.model_name:
            config["model"] = self.model_name
        return {"messages": messages, "config": config}

    def call(self, messages: List[Dict[str, str]]) -> str:
        last_exc: Optional[Exception] = None
        payload = self._make_payload(messages)
        headers = {"Content-Type": "application/json"}

        print(f"[ToolInvoker][debug] Starting LLM call, url={self.api_url}")

        for attempt in range(self.retries + 1):
            try:
                LOG.info("[ToolInvoker] calling LLM (attempt %d)", attempt + 1)
                print(f"[ToolInvoker][debug] Attempt {attempt + 1}...")
                
                with requests.post(
                    self.api_url,
                    json=payload,
                    stream=True,
                    timeout=self.timeout,
                    headers=headers,
                ) as resp:
                    resp.raise_for_status()
                    result = self._collect_stream(resp)

                    if AGENTIC_CHUNKER_DEBUG:
                        preview = result[:500].replace("\n", "\\n")
                        print(f"[ToolInvoker][debug] Got {len(result)} chars. Preview: {preview}")
                        self._log_debug(messages, result)

                    return result
            except requests.RequestException as e:
                last_exc = e
                LOG.warning("[ToolInvoker] request failed (attempt %d): %s", attempt + 1, e)
                time.sleep(0.5 * (2**attempt))

        raise RuntimeError(f"ToolInvoker failed after {self.retries + 1} attempts: {last_exc}")

    def _log_debug(self, messages: List[Dict[str, str]], result: str) -> None:
        """Log tool call to JSONL file for debugging."""
        try:
            os.makedirs(os.path.dirname(_DEBUG_LOG_PATH), exist_ok=True)
            parsed = self.extract_json(result)
            record = {
                "ts": int(time.time()),
                "model": self.model_name,
                "response_chars": len(result),
                "parsed": parsed,
                "response": result[:50000],
            }
            with open(_DEBUG_LOG_PATH, "a", encoding="utf-8") as f:
                f.write(json.dumps(record, ensure_ascii=False) + "\n")
            print(f"[ToolInvoker][debug] Wrote to {_DEBUG_LOG_PATH}")
        except Exception as e:
            print(f"[ToolInvoker][debug] write FAILED: {e}")

    def _collect_stream(self, resp: requests.Response) -> str:
        """Collect NDJSON stream."""
        parts: List[str] = []
        for raw_line in resp.iter_lines(decode_unicode=True):
            if not raw_line:
                continue
            if isinstance(raw_line, (bytes, bytearray)):
                raw_line = raw_line.decode("utf-8", errors="replace")
            try:
                obj = json.loads(raw_line)
                if isinstance(obj, dict) and "content" in obj:
                    content = obj.get("content")
                    if isinstance(content, str):
                        parts.append(content)
                        continue
            except Exception:
                pass
            parts.append(str(raw_line))
        return "".join(parts)

    def extract_json(self, text: str) -> Optional[dict]:
        """Extract JSON from LLM response."""
        if not text:
            return None

        def _sanitize(s: str) -> str:
            s = s.strip().replace("```json", "").replace("```", "").strip()
            s = s.replace("\u201c", '"').replace("\u201d", '"')
            s = re.sub(r",\s*([}\]])", r"\1", s)
            return s

        def _try_parse(s: str) -> Optional[dict]:
            s = _sanitize(s)
            try:
                obj = json.loads(s)
                return obj if isinstance(obj, dict) else None
            except Exception:
                return None

        # Try between markers
        start = text.find(JSON_START)
        end = text.rfind(JSON_END)
        if start != -1 and end != -1 and end > start:
            candidate = text[start + len(JSON_START):end].strip()
            obj = _try_parse(candidate)
            if obj:
                return obj

        # Fallback: brace matching
        first = text.find("{")
        if first == -1:
            return None
        depth = 0
        for i, ch in enumerate(text[first:], start=first):
            if ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0:
                    obj = _try_parse(text[first:i + 1])
                    if obj:
                        return obj
                    return None
        return None


# =============================================================================
# AGENTIC CHUNKER
# =============================================================================

class AgenticDocumentChunker:
    """LLM-driven chunker: identify sections → find anchors → chunk between them."""

    def __init__(self):
        self.invoker = ToolInvoker(api_url=AGENTIC_CHUNKER_API_URL)
        self.fallback_chunker = RecursiveCharacterTextSplitter(
            chunk_size=1000,
            chunk_overlap=200,
            separators=["\n\n", "\n", ". ", " ", ""],
        )

    def _analyze_document(self, text: str) -> Optional[Dict]:
        """Ask LLM to identify document sections with anchor_text."""
        
        key = _cache_key(text)
        cached = _PERSISTENT_CACHE.get(key)
        if cached:
            LOG.info("[Agentic] Using cached analysis")
            print(f"[Agentic][debug] CACHE HIT, skipping LLM call")
            return cached

        system = (
            "You are a document sectioning tool. Identify the main sections of this document.\n"
            "For each section, provide:\n"
            "- topic: A short descriptive title for the section\n"
            "- anchor_text: An EXACT substring from the document that marks where this section starts\n\n"
            "Rules for anchor_text:\n"
            "- Must be an exact substring that appears in the document (case-sensitive)\n"
            "- Prefer headings, titles, or first words of the section\n"
            "- Keep it short (10-80 chars)\n"
            "- Do NOT include quotes or backslashes\n\n"
            f"Return JSON wrapped between {JSON_START} and {JSON_END}:\n"
            "{\n"
            '  "tool": "analyze_structure",\n'
            '  "document_type": "resume|article|report|tutorial|other",\n'
            '  "sections": [\n'
            '    {"topic": "Section Name", "anchor_text": "EXACT TEXT FROM DOCUMENT"},\n'
            "    ...\n"
            "  ]\n"
            "}\n"
        )

        user = f"{JSON_START}\n\nTEXT:\n\n{text}\n\n{JSON_END}"

        try:
            raw = self.invoker.call([
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ])
            analysis = self.invoker.extract_json(raw)
            
            if analysis and analysis.get("tool") == "analyze_structure":
                _PERSISTENT_CACHE.set(key, analysis)
                return analysis
            return None
        except Exception as e:
            LOG.warning("[Agentic] Analysis failed: %s", e)
            return None

    def _build_chunks_from_sections(self, text: str, analysis: Dict, metadata: Dict) -> List[Dict[str, Any]]:
        """Build chunks by finding section anchors and splitting between them."""
        
        sections = analysis.get("sections", [])
        if not isinstance(sections, list) or len(sections) < 2:
            return []

        # Find positions of all anchors
        boundaries: List[Tuple[int, str]] = []
        last_pos = 0
        for s in sections:
            if not isinstance(s, dict):
                continue
            anchor = s.get("anchor_text")
            topic = s.get("topic", "")
            if not isinstance(anchor, str):
                continue
            
            pos = _find_anchor(text, anchor, start_hint=last_pos)
            if pos == -1:
                LOG.warning("[Agentic] Could not find anchor: %s", anchor[:50])
                continue
            
            boundaries.append((pos, str(topic).strip()))
            last_pos = pos

        if len(boundaries) < 2:
            return []

        # Sort and deduplicate
        boundaries = sorted(set(boundaries), key=lambda x: x[0])

        # Build chunks between boundaries
        chunks: List[Dict[str, Any]] = []
        text_len = len(text)
        
        # Add intro chunk if first section doesn't start at beginning
        if boundaries[0][0] > 50:
            intro_text = text[:boundaries[0][0]].strip()
            if intro_text:
                chunks.append({
                    "text": intro_text,
                    "metadata": {
                        **metadata,
                        "start": 0,
                        "end": boundaries[0][0],
                        "chunk_title": None,
                    }
                })

        # Create chunk for each section
        for i, (pos, title) in enumerate(boundaries):
            end = boundaries[i + 1][0] if i + 1 < len(boundaries) else text_len
            chunk_text = text[pos:end].strip()
            
            if not chunk_text:
                continue
                
            chunks.append({
                "text": chunk_text,
                "metadata": {
                    **metadata,
                    "start": pos,
                    "end": end,
                    "chunk_title": title if title else None,
                }
            })

        return chunks

    def chunk_text(self, text: str, metadata: Dict[str, Any] = None, merge_window: int = None) -> List[Dict[str, Any]]:
        """Chunk text using LLM section analysis.
        
        Args:
            text: The text to chunk
            metadata: Base metadata to include in each chunk
            merge_window: Override merge window (None = use config default)
        """
        
        if not text or not text.strip():
            return []

        metadata = metadata or {}

        # Step 1: Get LLM analysis
        analysis = self._analyze_document(text)
        
        # Step 2: Build chunks from sections
        chunks = []
        if analysis:
            chunks = self._build_chunks_from_sections(text, analysis, metadata)
            LOG.info("[Agentic] Created %d chunks from LLM analysis", len(chunks))

        # Fallback if LLM analysis failed
        if not chunks:
            LOG.warning("[Agentic] Falling back to recursive splitter")
            raw = self.fallback_chunker.split_text(text)
            for i, c in enumerate(raw):
                c = c.strip()
                if c:
                    chunks.append({
                        "text": c,
                        "metadata": {
                            **metadata,
                            "chunk_title": None,
                            "chunking_method": "fallback",
                        }
                    })

        # Merge adjacent chunks for overlapping context
        # Use provided merge_window or fall back to config default
        effective_merge_window = merge_window if merge_window is not None else AGENTIC_CHUNK_MERGE_WINDOW
        if effective_merge_window >= 1 and len(chunks) > 1:
            chunks = _merge_adjacent_chunks(chunks, effective_merge_window)

        # Add indexing metadata
        for i, chunk in enumerate(chunks):
            chunk["metadata"]["chunk_index"] = i
            chunk["metadata"]["chunk_total"] = len(chunks)
            chunk["metadata"]["char_count"] = len(chunk["text"])
            if "chunking_method" not in chunk["metadata"]:
                chunk["metadata"]["chunking_method"] = "agentic"
                chunk["metadata"]["agentic_model"] = AGENTIC_CHUNKER_MODEL_NAME

        return chunks

    def chunk_pages(self, pages: List[Dict[str, Any]], base_metadata: Dict[str, Any] = None, merge_window: int = None) -> List[Dict[str, Any]]:
        """Chunk a list of pages from PDF extraction.
        
        Args:
            pages: List of page dicts with 'text' key
            base_metadata: Base metadata to include in each chunk
            merge_window: Override merge window (None = use config default)
        """
        
        base_metadata = base_metadata or {}
        
        # Join all pages into single text
        joined_text, page_spans = _iter_page_spans(pages, separator="\n\n")
        if not joined_text.strip():
            return []

        try:
            chunks = self.chunk_text(joined_text, base_metadata, merge_window=merge_window)
        except Exception as e:
            LOG.warning("Agentic chunking failed: %s", e)
            raw = self.fallback_chunker.split_text(joined_text)
            chunks = []
            for i, c in enumerate(raw):
                c = c.strip()
                if c:
                    chunks.append({
                        "text": c,
                        "metadata": {
                            **base_metadata,
                            "chunk_index": i,
                            "chunk_total": len(raw),
                            "char_count": len(c),
                            "chunking_method": "error_fallback",
                        }
                    })

        # Add page metadata
        for chunk in chunks:
            start = chunk.get("metadata", {}).get("start", 0) or 0
            end = chunk.get("metadata", {}).get("end", 0) or 0
            
            # If no start/end, find text position
            if end <= start:
                t = chunk.get("text", "")
                if t:
                    pos = joined_text.find(t)
                    if pos != -1:
                        start = pos
                        end = pos + len(t)
            
            p_start, p_end = _pages_for_range(page_spans, start, end)
            chunk["metadata"]["page_num"] = p_start
            if p_end and p_end != p_start:
                chunk["metadata"]["page_num_end"] = p_end

        # Global indexing
        for i, chunk in enumerate(chunks):
            chunk["metadata"]["global_chunk_index"] = i

        return chunks


# Global instance
agentic_chunker = AgenticDocumentChunker()
