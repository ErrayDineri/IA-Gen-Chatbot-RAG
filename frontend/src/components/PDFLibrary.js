import React, { useState, useMemo } from 'react';
import './PDFLibrary.css';

function PDFLibrary({ pdfs, onTagUpdate, onDelete }) {
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
        <h2>PDF Library ({filteredPdfs.length})</h2>
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
          <span className="empty-icon">📚</span>
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
                <th className="col-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredPdfs.map((pdf) => (
                <tr key={pdf.id} className="pdf-row">
                  <td className="col-name">
                    <span className="pdf-icon">📄</span>
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
                        <button className="save-btn" onClick={() => handleSaveTags(pdf.id)}>✓</button>
                        <button className="cancel-btn" onClick={handleCancelEdit}>✕</button>
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
                          ✏️
                        </button>
                      </div>
                    )}
                  </td>
                  <td className="col-actions">
                    <a 
                      href={`http://localhost:5000${pdf.url}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="view-btn"
                      title="View PDF"
                    >
                      👁️
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
                      🗑️
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
