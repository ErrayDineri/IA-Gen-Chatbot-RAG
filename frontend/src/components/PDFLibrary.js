import React, { useState, useMemo } from 'react';
import './PDFLibrary.css';

function PDFLibrary({ pdfs, onTagUpdate, onDelete, onDeleteAll, onRetryRag }) {
  const [editingId, setEditingId] = useState(null);
  const [editTags, setEditTags] = useState('');
  const [selectedTag, setSelectedTag] = useState('all');

  // Get all unique tags
  const allTags = useMemo(() => {
    const tagSet = new Set();
    pdfs.forEach(pdf => {
      pdf.tags?.forEach(tag => tagSet.add(tag));
    });
    return Array.from(tagSet).sort();
  }, [pdfs]);

  // Filter PDFs by selected tag
  const filteredPdfs = useMemo(() => {
    if (selectedTag === 'all') return pdfs;
    if (selectedTag === 'untagged') return pdfs.filter(pdf => !pdf.tags || pdf.tags.length === 0);
    return pdfs.filter(pdf => pdf.tags?.includes(selectedTag));
  }, [pdfs, selectedTag]);

  const handleEditClick = (pdf) => {
    setEditingId(pdf.id);
    setEditTags(pdf.tags.join(', '));
  };

  const handleSaveTags = (id) => {
    const tagsArray = editTags.split(',').map(tag => tag.trim()).filter(tag => tag);
    onTagUpdate(id, tagsArray);
    setEditingId(null);
    setEditTags('');
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditTags('');
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric'
    });
  };

  const formatSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1024 / 1024).toFixed(2) + ' MB';
  };

  return (
    <div className="library-container">
      <div className="library-header">
        <div className="library-title-row">
          <h2>PDF Library ({filteredPdfs.length})</h2>
          {pdfs.length > 0 && (
            <button 
              className="delete-all-btn"
              onClick={() => {
                if (window.confirm(`Delete all ${pdfs.length} PDFs? This will also clear the vector database.`)) {
                  onDeleteAll();
                }
              }}
              title="Delete all PDFs"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
              </svg>
              Delete All
            </button>
          )}
        </div>
        <div className="tag-filter">
          <label>Filter by tag:</label>
          <select 
            value={selectedTag} 
            onChange={(e) => setSelectedTag(e.target.value)}
            className="tag-select"
          >
            <option value="all">All PDFs ({pdfs.length})</option>
            <option value="untagged">Untagged</option>
            {allTags.map(tag => (
              <option key={tag} value={tag}>
                {tag} ({pdfs.filter(p => p.tags?.includes(tag)).length})
              </option>
            ))}
          </select>
        </div>
      </div>
      
      {filteredPdfs.length === 0 ? (
        <div className="empty-state">
          <span className="empty-icon">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
            </svg>
          </span>
          <p>No PDFs found</p>
          <p className="empty-subtitle">
            {selectedTag === 'all' ? 'Upload your first PDF to get started!' : 'No PDFs with this tag'}
          </p>
        </div>
      ) : (
        <div className="pdf-table-container">
          <table className="pdf-table">
            <thead>
              <tr>
                <th className="col-name">Name</th>
                <th className="col-size">Size</th>
                <th className="col-date">Date</th>
                <th className="col-tags">Tags</th>
                <th className="col-rag">RAG</th>
                <th className="col-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredPdfs.map((pdf) => (
                <tr key={pdf.id} className="pdf-row">
                  <td className="col-name">
                    <span className="pdf-icon">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                        <polyline points="14 2 14 8 20 8"/>
                        <line x1="16" y1="13" x2="8" y2="13"/>
                        <line x1="16" y1="17" x2="8" y2="17"/>
                      </svg>
                    </span>
                    <span className="pdf-filename" title={pdf.filename}>{pdf.filename}</span>
                  </td>
                  <td className="col-size">{formatSize(pdf.size)}</td>
                  <td className="col-date">{formatDate(pdf.uploadedAt)}</td>
                  <td className="col-tags">
                    {editingId === pdf.id ? (
                      <div className="tags-edit-inline">
                        <input
                          type="text"
                          value={editTags}
                          onChange={(e) => setEditTags(e.target.value)}
                          placeholder="tag1, tag2"
                          className="tags-edit-input"
                          autoFocus
                        />
                        <button className="save-btn" onClick={() => handleSaveTags(pdf.id)} title="Save">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                            <polyline points="20 6 9 17 4 12"/>
                          </svg>
                        </button>
                        <button className="cancel-btn" onClick={handleCancelEdit} title="Cancel">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                            <line x1="18" y1="6" x2="6" y2="18"/>
                            <line x1="6" y1="6" x2="18" y2="18"/>
                          </svg>
                        </button>
                      </div>
                    ) : (
                      <div className="tags-display">
                        {pdf.tags && pdf.tags.length > 0 ? (
                          pdf.tags.map((tag, index) => (
                            <span key={index} className="tag">{tag}</span>
                          ))
                        ) : (
                          <span className="no-tags">—</span>
                        )}
                        <button 
                          className="edit-tags-btn"
                          onClick={() => handleEditClick(pdf)}
                          title="Edit tags"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                          </svg>
                        </button>
                      </div>
                    )}
                  </td>
                  <td className="col-rag">
                    <div className={`rag-status ${pdf.ragStatus || (pdf.ragProcessed ? 'success' : 'pending')}`} title={pdf.ragError || ''}>
                      {(pdf.ragStatus === 'success' || pdf.ragProcessed) && (
                        <>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="20 6 9 17 4 12"/>
                          </svg>
                          <span>{pdf.chunksCount || 0} chunks</span>
                        </>
                      )}
                      {pdf.ragStatus === 'failed' && (
                        <>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="12" cy="12" r="10"/>
                            <line x1="15" y1="9" x2="9" y2="15"/>
                            <line x1="9" y1="9" x2="15" y2="15"/>
                          </svg>
                          <span>Failed</span>
                          <button 
                            className="retry-rag-btn"
                            onClick={() => onRetryRag && onRetryRag(pdf.id)}
                            title="Retry RAG processing"
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <polyline points="23 4 23 10 17 10"/>
                              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
                            </svg>
                          </button>
                        </>
                      )}
                      {pdf.ragStatus === 'processing' && (
                        <>
                          <span className="rag-spinner"></span>
                          <span>Processing</span>
                        </>
                      )}
                      {!pdf.ragStatus && !pdf.ragProcessed && (
                        <button 
                          className="process-rag-btn"
                          onClick={() => onRetryRag && onRetryRag(pdf.id)}
                          title="Process with RAG"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="12" cy="12" r="10"/>
                            <polygon points="10 8 16 12 10 16 10 8"/>
                          </svg>
                          <span>Process</span>
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="col-actions">
                    <a 
                      href={`http://localhost:5000${pdf.url}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="view-btn"
                      title="View PDF"
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                        <circle cx="12" cy="12" r="3"/>
                      </svg>
                    </a>
                    <button 
                      className="delete-btn"
                      onClick={() => {
                        if (window.confirm(`Delete "${pdf.filename}"?`)) {
                          onDelete(pdf.id);
                        }
                      }}
                      title="Delete PDF"
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="3 6 5 6 21 6"/>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                      </svg>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default PDFLibrary;
