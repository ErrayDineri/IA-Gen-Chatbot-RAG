import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './PDFUpload.css';

function PDFUpload({ onUploadSuccess }) {
  const [files, setFiles] = useState([]);
  const [tags, setTags] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  
  // Processing options with defaults
  const [config, setConfig] = useState({
    defaults: { extractor_mode: 'text', chunker_mode: 'agentic', merge_window: 3 },
    options: { extractor_modes: ['text', 'vision'], chunker_modes: ['semantic', 'agentic'], merge_window_range: [0, 5] }
  });
  const [extractorMode, setExtractorMode] = useState('');
  const [chunkerMode, setChunkerMode] = useState('');
  const [mergeWindow, setMergeWindow] = useState('');
  
  // Fetch config on mount
  useEffect(() => {
    axios.get('/api/rag/config')
      .then(res => setConfig(res.data))
      .catch(() => {}); // Use defaults on error
  }, []);

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
    
    // Add processing options (use selected or default)
    const processingOptions = {
      extractor_mode: extractorMode || config.defaults.extractor_mode,
      chunker_mode: chunkerMode || config.defaults.chunker_mode,
      merge_window: mergeWindow !== '' ? parseInt(mergeWindow) : config.defaults.merge_window
    };
    formData.append('processingOptions', JSON.stringify(processingOptions));

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
                <span className="file-icon">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                    <line x1="16" y1="13" x2="8" y2="13"/>
                    <line x1="16" y1="17" x2="8" y2="17"/>
                    <polyline points="10 9 9 9 8 9"/>
                  </svg>
                </span>
                <p className="file-name">{files.length} file(s) selected</p>
                <p className="file-size">
                  Total: {(files.reduce((acc, f) => acc + f.size, 0) / 1024 / 1024).toFixed(2)} MB
                </p>
              </>
            ) : (
              <>
                <span className="upload-icon">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="17 8 12 3 7 8"/>
                    <line x1="12" y1="3" x2="12" y2="15"/>
                  </svg>
                </span>
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
                <span className="file-item-icon">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                  </svg>
                </span>
                <span className="file-item-name">{file.name}</span>
                <span className="file-item-size">{(file.size / 1024 / 1024).toFixed(2)} MB</span>
                <button 
                  type="button" 
                  className="remove-file-btn"
                  onClick={() => removeFile(index)}
                  title="Remove file"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18"/>
                    <line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
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

        <div className="advanced-options">
          <button 
            type="button" 
            className="advanced-toggle"
            onClick={() => setShowAdvanced(!showAdvanced)}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
            Processing Options
            <svg 
              width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              style={{ transform: showAdvanced ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}
            >
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </button>
          
          {showAdvanced && (
            <div className="options-panel">
              <div className="option-row">
                <label htmlFor="extractor-mode">
                  <span className="option-label">Extractor</span>
                  <span className="option-hint">text=fast, vision=OCR</span>
                </label>
                <select
                  id="extractor-mode"
                  value={extractorMode || config.defaults.extractor_mode}
                  onChange={(e) => setExtractorMode(e.target.value)}
                  className="option-select"
                >
                  {config.options.extractor_modes.map(mode => (
                    <option key={mode} value={mode}>
                      {mode}{mode === config.defaults.extractor_mode ? ' (default)' : ''}
                    </option>
                  ))}
                </select>
              </div>
              
              <div className="option-row">
                <label htmlFor="chunker-mode">
                  <span className="option-label">Chunker</span>
                  <span className="option-hint">semantic=embedding, agentic=LLM</span>
                </label>
                <select
                  id="chunker-mode"
                  value={chunkerMode || config.defaults.chunker_mode}
                  onChange={(e) => setChunkerMode(e.target.value)}
                  className="option-select"
                >
                  {config.options.chunker_modes.map(mode => (
                    <option key={mode} value={mode}>
                      {mode}{mode === config.defaults.chunker_mode ? ' (default)' : ''}
                    </option>
                  ))}
                </select>
              </div>
              
              <div className="option-row">
                <label htmlFor="merge-window">
                  <span className="option-label">Merge Window</span>
                  <span className="option-hint">0=none, N=N neighbors each side</span>
                </label>
                <div className="slider-container">
                  <input
                    type="range"
                    id="merge-window"
                    min={config.options.merge_window_range[0]}
                    max={config.options.merge_window_range[1]}
                    value={mergeWindow !== '' ? mergeWindow : config.defaults.merge_window}
                    onChange={(e) => setMergeWindow(e.target.value)}
                    className="option-slider"
                  />
                  <span className="slider-value">
                    {mergeWindow !== '' ? mergeWindow : config.defaults.merge_window}
                  </span>
                </div>
              </div>
            </div>
          )}
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
