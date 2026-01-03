import React, { useState, useEffect } from 'react';
import './App.css';
import PDFUpload from './components/PDFUpload';
import PDFLibrary from './components/PDFLibrary';
import Chatbot from './components/Chatbot';
import axios from 'axios';

function App() {
  const [pdfs, setPdfs] = useState([]);

  const fetchPDFs = async () => {
    try {
      const response = await axios.get('/api/pdfs');
      setPdfs(response.data);
    } catch (error) {
      console.error('Error fetching PDFs:', error);
    }
  };

  useEffect(() => {
    fetchPDFs();
  }, []);

  const handleUploadSuccess = () => {
    fetchPDFs();
  };

  const handleTagUpdate = async (id, newTags) => {
    try {
      await axios.put(`/api/pdfs/${id}/tags`, { tags: newTags });
      fetchPDFs();
    } catch (error) {
      console.error('Error updating tags:', error);
    }
  };

  const handleDelete = async (id) => {
    try {
      await axios.delete(`/api/pdfs/${id}`);
      fetchPDFs();
    } catch (error) {
      console.error('Error deleting PDF:', error);
    }
  };

  const handleDeleteAll = async () => {
    try {
      await axios.delete('/api/pdfs');
      fetchPDFs();
    } catch (error) {
      console.error('Error deleting all PDFs:', error);
    }
  };

  const handleRetryRag = async (id) => {
    try {
      await axios.post(`/api/rag/reprocess/${id}`);
      // Poll for updates
      setTimeout(fetchPDFs, 1000);
      setTimeout(fetchPDFs, 3000);
      setTimeout(fetchPDFs, 6000);
    } catch (error) {
      console.error('Error retrying RAG:', error);
    }
  };

  // Poll for RAG status updates when there are processing PDFs
  useEffect(() => {
    const hasProcessing = pdfs.some(p => p.ragStatus === 'processing');
    if (hasProcessing) {
      const interval = setInterval(fetchPDFs, 3000);
      return () => clearInterval(interval);
    }
  }, [pdfs]);

  return (
    <div className="App">
      <header className="App-header">
        <h1>📚 PDF Library Manager</h1>
      </header>
      
      <div className="main-layout">
        <aside className="sidebar">
          <PDFUpload onUploadSuccess={handleUploadSuccess} />
        </aside>
        <main className="content">
          <PDFLibrary 
            pdfs={pdfs} 
            onTagUpdate={handleTagUpdate}
            onDelete={handleDelete}
            onDeleteAll={handleDeleteAll}
            onRetryRag={handleRetryRag}
          />
        </main>
      </div>
      
      <Chatbot />
    </div>
  );
}

export default App;
