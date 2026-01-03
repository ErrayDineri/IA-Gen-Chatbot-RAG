import React, { useState } from 'react';
import axios from 'axios';
import './PDFUpload.css';

function PDFUpload({ onUploadSuccess }) {
  const [files, setFiles] = useState([]);
  const [tags, setTags] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const droppedFiles = Array.from(e.dataTransfer.files);
      const pdfFiles = droppedFiles.filter(f => f.type === 'application/pdf');
      const nonPdfCount = droppedFiles.length - pdfFiles.length;
      
      if (pdfFiles.length > 0) {
        setFiles(prev => [...prev, ...pdfFiles]);
        if (nonPdfCount > 0) {
          setMessage(`${nonPdfCount} non-PDF file(s) were skipped`);
        } else {
          setMessage('');
        }
      } else {
        setMessage('Please upload PDF files only');
      }
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      const selectedFiles = Array.from(e.target.files);
      const pdfFiles = selectedFiles.filter(f => f.type === 'application/pdf');
      const nonPdfCount = selectedFiles.length - pdfFiles.length;
      
      if (pdfFiles.length > 0) {
        setFiles(prev => [...prev, ...pdfFiles]);
        if (nonPdfCount > 0) {
          setMessage(`${nonPdfCount} non-PDF file(s) were skipped`);
        } else {
          setMessage('');
        }
      } else {
        setMessage('Please upload PDF files only');
      }
    }
  };

  const removeFile = (index) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (files.length === 0) {
      setMessage('Please select at least one PDF file');
      return;
    }

    const formData = new FormData();
    files.forEach(file => {
      formData.append('pdfs', file);
    });
    formData.append('tags', tags);

    setUploading(true);
    setMessage('');

    try {
      await axios.post('/api/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      
      setMessage(`${files.length} PDF(s) uploaded successfully!`);
      setFiles([]);
      setTags('');
      onUploadSuccess();
      
      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      setMessage('Error uploading PDFs: ' + (error.response?.data?.error || error.message));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="upload-container">
      <h2>Upload PDF</h2>
      <form onSubmit={handleSubmit}>
        <div 
          className={`drop-zone ${dragActive ? 'active' : ''} ${files.length > 0 ? 'has-file' : ''}`}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
        >
          <input
            type="file"
            id="file-input"
            accept=".pdf"
            multiple
            onChange={handleFileChange}
            style={{ display: 'none' }}
          />
          <label htmlFor="file-input" className="file-label">
            {files.length > 0 ? (
              <>
                <span className="file-icon">📄</span>
                <p className="file-name">{files.length} file(s) selected</p>
                <p className="file-size">
                  Total: {(files.reduce((acc, f) => acc + f.size, 0) / 1024 / 1024).toFixed(2)} MB
                </p>
              </>
            ) : (
              <>
                <span className="upload-icon">📁</span>
                <p>Drag & drop your PDFs here</p>
                <p className="or-text">(Multiple files supported)</p>
              </>
            )}
          </label>
        </div>

        {files.length > 0 && (
          <div className="files-list">
            {files.map((file, index) => (
              <div key={index} className="file-item">
                <span className="file-item-name">📄 {file.name}</span>
                <span className="file-item-size">{(file.size / 1024 / 1024).toFixed(2)} MB</span>
                <button 
                  type="button" 
                  className="remove-file-btn"
                  onClick={() => removeFile(index)}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="tags-input-container">
          <label htmlFor="tags">Tags (comma-separated):</label>
          <input
            type="text"
            id="tags"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="e.g., research, important, 2024"
            className="tags-input"
          />
        </div>

        <button 
          type="submit" 
          className="upload-btn"
          disabled={files.length === 0 || uploading}
        >
          {uploading ? 'Uploading...' : `Upload ${files.length > 0 ? files.length : ''} PDF${files.length !== 1 ? 's' : ''}`}
        </button>

        {message && (
          <div className={`message ${message.includes('Error') ? 'error' : 'success'}`}>
            {message}
          </div>
        )}
      </form>
    </div>
  );
}

export default PDFUpload;
