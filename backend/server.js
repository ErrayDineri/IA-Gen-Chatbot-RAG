const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const FormData = require('form-data');

const app = express();
const PORT = process.env.PORT || 5000;
const RAG_SERVICE_URL = process.env.RAG_SERVICE_URL || 'http://localhost:8001';

// Middleware
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Set UTF-8 encoding for responses
app.use((req, res, next) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  next();
});

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Database simulation (in-memory storage)
// In production, you would use a real database
let pdfsDatabase = [];
let chatsDatabase = [];

// Load database from file if exists
const dbPath = path.join(__dirname, 'database.json');
const chatsDbPath = path.join(__dirname, 'chats.json');

if (fs.existsSync(dbPath)) {
  try {
    const data = fs.readFileSync(dbPath, 'utf8');
    pdfsDatabase = JSON.parse(data);
  } catch (error) {
    console.error('Error loading database:', error);
  }
}

if (fs.existsSync(chatsDbPath)) {
  try {
    const data = fs.readFileSync(chatsDbPath, 'utf8');
    chatsDatabase = JSON.parse(data);
  } catch (error) {
    console.error('Error loading chats database:', error);
  }
}

// Save database to file with UTF-8 encoding
function saveDatabase() {
  try {
    fs.writeFileSync(dbPath, JSON.stringify(pdfsDatabase, null, 2), 'utf8');
  } catch (error) {
    console.error('Error saving database:', error);
  }
}

function saveChatsDatabase() {
  try {
    fs.writeFileSync(chatsDbPath, JSON.stringify(chatsDatabase, null, 2), 'utf8');
  } catch (error) {
    console.error('Error saving chats database:', error);
  }
}

// Configure multer for file upload
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${uuidv4()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed!'), false);
    }
  },
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

// Routes

// Get all PDFs
app.get('/api/pdfs', (req, res) => {
  res.json(pdfsDatabase);
});

// Get a specific PDF
app.get('/api/pdfs/:id', (req, res) => {
  const pdf = pdfsDatabase.find(p => p.id === req.params.id);
  if (!pdf) {
    return res.status(404).json({ error: 'PDF not found' });
  }
  res.json(pdf);
});

// Upload PDF (supports multiple files)
app.post('/api/upload', upload.array('pdfs', 20), (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    const tags = req.body.tags ? req.body.tags.split(',').map(tag => tag.trim()).filter(tag => tag) : [];
    
    // Processing options - parse from JSON string sent by frontend
    let processingOptions = {
      extractor_mode: null,
      chunker_mode: null,
      merge_window: null
    };
    
    if (req.body.processingOptions) {
      try {
        const parsed = JSON.parse(req.body.processingOptions);
        processingOptions = {
          extractor_mode: parsed.extractor_mode || null,
          chunker_mode: parsed.chunker_mode || null,
          merge_window: parsed.merge_window !== undefined ? parsed.merge_window : null
        };
        console.log('[Upload] Processing options:', processingOptions);
      } catch (e) {
        console.warn('[Upload] Failed to parse processingOptions:', e.message);
      }
    }

    const uploadedPdfs = req.files.map(file => {
      // Decode UTF-8 filename properly
      const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
      const pdfData = {
        id: uuidv4(),
        filename: originalName,
        storedFilename: file.filename,
        size: file.size,
        url: `/uploads/${file.filename}`,
        tags: tags,
        uploadedAt: new Date().toISOString(),
        ragStatus: 'processing', // 'processing', 'success', 'failed'
        ragError: null,
        chunksCount: 0
      };
      pdfsDatabase.push(pdfData);
      return pdfData;
    });

    saveDatabase();

    // Process PDFs with RAG service using batch processing
    processPdfsWithRagBatch(uploadedPdfs, processingOptions).catch(err => {
      console.error('Error in batch RAG processing:', err.message);
    });

    res.status(201).json({
      message: `${uploadedPdfs.length} PDF(s) uploaded successfully`,
      pdfs: uploadedPdfs
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Error uploading files' });
  }
});

// Process multiple PDFs with RAG service in batch (efficient model loading)
async function processPdfsWithRagBatch(pdfs, processingOptions = {}) {
  if (!pdfs || pdfs.length === 0) return;
  
  // For single PDF, use the simpler path-based endpoint
  if (pdfs.length === 1) {
    return processPdfWithRag(pdfs[0], processingOptions);
  }
  
  console.log(`[Batch] Processing ${pdfs.length} PDFs with RAG service...`);
  
  try {
    // Build items array with file paths
    const items = pdfs.map(pdf => ({
      pdf_id: pdf.id,
      filename: pdf.filename,
      file_path: path.join(uploadsDir, pdf.storedFilename),
      tags: pdf.tags
    }));
    
    // Build request body with global processing options
    const requestBody = { 
      items,
      // Include processing options if provided
      ...(processingOptions.extractor_mode && { extractor_mode: processingOptions.extractor_mode }),
      ...(processingOptions.chunker_mode && { chunker_mode: processingOptions.chunker_mode }),
      ...(processingOptions.merge_window !== null && processingOptions.merge_window !== undefined && { merge_window: processingOptions.merge_window })
    };
    
    // Call batch endpoint with JSON body
    const response = await fetch(`${RAG_SERVICE_URL}/process-batch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`RAG batch service error: ${error}`);
    }
    
    const result = await response.json();
    console.log(`[Batch] Complete: ${result.processed} processed, ${result.failed} failed`);
    
    // Update each PDF with its result
    for (const item of result.results) {
      const pdfIndex = pdfsDatabase.findIndex(p => p.id === item.pdf_id);
      if (pdfIndex !== -1) {
        if (item.success) {
          pdfsDatabase[pdfIndex].ragStatus = 'success';
          pdfsDatabase[pdfIndex].ragError = null;
          pdfsDatabase[pdfIndex].chunksCount = item.chunks_created;
        } else {
          pdfsDatabase[pdfIndex].ragStatus = 'failed';
          pdfsDatabase[pdfIndex].ragError = item.error;
        }
      }
    }
    saveDatabase();
    
    return result;
  } catch (error) {
    console.error(`[Batch] RAG processing failed:`, error.message);
    
    // Mark all PDFs as failed
    for (const pdf of pdfs) {
      const pdfIndex = pdfsDatabase.findIndex(p => p.id === pdf.id);
      if (pdfIndex !== -1) {
        pdfsDatabase[pdfIndex].ragStatus = 'failed';
        pdfsDatabase[pdfIndex].ragError = error.message;
      }
    }
    saveDatabase();
    
    throw error;
  }
}

// Process PDF with RAG service (single file)
async function processPdfWithRag(pdf, processingOptions = {}) {
  try {
    const filePath = path.join(uploadsDir, pdf.storedFilename);
    
    // Use the path-based endpoint to avoid multipart parsing issues
    const response = await fetch(`${RAG_SERVICE_URL}/process-pdf-path`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        pdf_id: pdf.id,
        filename: pdf.filename,
        tags: pdf.tags,
        file_path: filePath,
        // Include processing options if provided
        ...(processingOptions.extractor_mode && { extractor_mode: processingOptions.extractor_mode }),
        ...(processingOptions.chunker_mode && { chunker_mode: processingOptions.chunker_mode }),
        ...(processingOptions.merge_window !== null && processingOptions.merge_window !== undefined && { merge_window: processingOptions.merge_window })
      })
    });
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`RAG service error: ${error}`);
    }
    
    const result = await response.json();
    console.log(`RAG processed ${pdf.filename}: ${result.chunks_created} chunks`);
    
    // Update PDF with RAG status - success
    const pdfIndex = pdfsDatabase.findIndex(p => p.id === pdf.id);
    if (pdfIndex !== -1) {
      pdfsDatabase[pdfIndex].ragStatus = 'success';
      pdfsDatabase[pdfIndex].ragError = null;
      pdfsDatabase[pdfIndex].chunksCount = result.chunks_created;
      saveDatabase();
    }
    
    return result;
  } catch (error) {
    console.error(`RAG processing failed for ${pdf.filename}:`, error.message);
    
    // Update PDF with RAG status - failed
    const pdfIndex = pdfsDatabase.findIndex(p => p.id === pdf.id);
    if (pdfIndex !== -1) {
      pdfsDatabase[pdfIndex].ragStatus = 'failed';
      pdfsDatabase[pdfIndex].ragError = error.message;
      saveDatabase();
    }
    
    throw error;
  }
}

// Get RAG processing configuration options
app.get('/api/rag/config', async (req, res) => {
  try {
    const response = await fetch(`${RAG_SERVICE_URL}/config`);
    if (!response.ok) {
      throw new Error('Failed to fetch RAG config');
    }
    const config = await response.json();
    res.json(config);
  } catch (error) {
    // Return sensible defaults if RAG service is unavailable
    res.json({
      defaults: {
        extractor_mode: 'text',
        chunker_mode: 'agentic',
        merge_window: 3
      },
      options: {
        extractor_modes: ['text', 'vision'],
        chunker_modes: ['semantic', 'agentic'],
        merge_window_range: [0, 5]
      }
    });
  }
});

// Update PDF tags
app.put('/api/pdfs/:id/tags', async (req, res) => {
  const pdfIndex = pdfsDatabase.findIndex(p => p.id === req.params.id);
  
  if (pdfIndex === -1) {
    return res.status(404).json({ error: 'PDF not found' });
  }

  pdfsDatabase[pdfIndex].tags = req.body.tags || [];
  saveDatabase();

  // Update tags in RAG service
  try {
    await fetch(`${RAG_SERVICE_URL}/document/${req.params.id}/tags`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pdf_id: req.params.id, tags: req.body.tags || [] })
    });
  } catch (error) {
    console.error('Error updating tags in RAG service:', error.message);
  }

  res.json({
    message: 'Tags updated successfully',
    pdf: pdfsDatabase[pdfIndex]
  });
});

// Delete PDF
app.delete('/api/pdfs/:id', async (req, res) => {
  const pdfIndex = pdfsDatabase.findIndex(p => p.id === req.params.id);
  
  if (pdfIndex === -1) {
    return res.status(404).json({ error: 'PDF not found' });
  }

  const pdf = pdfsDatabase[pdfIndex];
  const filePath = path.join(uploadsDir, pdf.storedFilename);

  // Delete file from filesystem
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }

  // Delete from RAG service
  try {
    await fetch(`${RAG_SERVICE_URL}/document/${req.params.id}`, {
      method: 'DELETE'
    });
  } catch (error) {
    console.error('Error deleting from RAG service:', error.message);
  }

  // Remove from database
  pdfsDatabase.splice(pdfIndex, 1);
  saveDatabase();

  res.json({ message: 'PDF deleted successfully' });
});

// Delete all PDFs
app.delete('/api/pdfs', async (req, res) => {
  try {
    // Delete all files from filesystem
    for (const pdf of pdfsDatabase) {
      const filePath = path.join(uploadsDir, pdf.storedFilename);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    // Clear RAG service
    try {
      await fetch(`${RAG_SERVICE_URL}/clear-all`, {
        method: 'DELETE'
      });
    } catch (error) {
      console.error('Error clearing RAG service:', error.message);
    }

    // Clear database
    const deletedCount = pdfsDatabase.length;
    pdfsDatabase.length = 0;
    saveDatabase();

    res.json({ 
      message: 'All PDFs deleted successfully',
      deletedCount 
    });
  } catch (error) {
    console.error('Error deleting all PDFs:', error);
    res.status(500).json({ error: 'Error deleting all PDFs' });
  }
});

// Chat History Routes

// Get all chats
app.get('/api/chats', (req, res) => {
  res.json(chatsDatabase);
});

// Get a specific chat
app.get('/api/chats/:id', (req, res) => {
  const chat = chatsDatabase.find(c => c.id === req.params.id);
  if (!chat) {
    return res.status(404).json({ error: 'Chat not found' });
  }
  res.json(chat);
});

// Save a chat
app.post('/api/chats', (req, res) => {
  try {
    const { id, name, messages, date } = req.body;
    
    const chatData = {
      id: id || uuidv4(),
      name: name || 'New Chat',
      messages: messages || [],
      date: date || new Date().toISOString()
    };

    // Update existing or add new
    const existingIndex = chatsDatabase.findIndex(c => c.id === chatData.id);
    if (existingIndex >= 0) {
      chatsDatabase[existingIndex] = chatData;
    } else {
      chatsDatabase.unshift(chatData);
    }

    // Keep only last 50 chats
    chatsDatabase = chatsDatabase.slice(0, 50);
    saveChatsDatabase();

    res.status(201).json(chatData);
  } catch (error) {
    console.error('Error saving chat:', error);
    res.status(500).json({ error: 'Error saving chat' });
  }
});

// Delete a chat
app.delete('/api/chats/:id', (req, res) => {
  const chatIndex = chatsDatabase.findIndex(c => c.id === req.params.id);
  
  if (chatIndex === -1) {
    return res.status(404).json({ error: 'Chat not found' });
  }

  chatsDatabase.splice(chatIndex, 1);
  saveChatsDatabase();

  res.json({ message: 'Chat deleted successfully' });
});

// RAG Query Routes

// Query RAG service
app.post('/api/rag/query', async (req, res) => {
  try {
    const { query, tags, pdf_ids, top_k = 5 } = req.body;
    
    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }
    
    const response = await fetch(`${RAG_SERVICE_URL}/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, tags, pdf_ids, top_k })
    });
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(error);
    }
    
    const results = await response.json();
    res.json(results);
  } catch (error) {
    console.error('RAG query error:', error);
    res.status(500).json({ error: 'Error querying RAG service: ' + error.message });
  }
});

// Get RAG service status
app.get('/api/rag/status', async (req, res) => {
  try {
    const response = await fetch(`${RAG_SERVICE_URL}/health`);
    
    if (!response.ok) {
      throw new Error('RAG service not healthy');
    }
    
    const status = await response.json();
    res.json({ available: true, ...status });
  } catch (error) {
    res.json({ available: false, error: error.message });
  }
});

// Get RAG tags
app.get('/api/rag/tags', async (req, res) => {
  try {
    const response = await fetch(`${RAG_SERVICE_URL}/tags`);
    
    if (!response.ok) {
      throw new Error('Failed to get tags');
    }
    
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Error getting RAG tags:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get RAG stats
app.get('/api/rag/stats', async (req, res) => {
  try {
    const response = await fetch(`${RAG_SERVICE_URL}/stats`);
    
    if (!response.ok) {
      throw new Error('Failed to get stats');
    }
    
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Error getting RAG stats:', error);
    res.status(500).json({ error: error.message });
  }
});

// Reprocess a PDF with RAG
app.post('/api/rag/reprocess/:id', async (req, res) => {
  try {
    const pdfIndex = pdfsDatabase.findIndex(p => p.id === req.params.id);
    
    if (pdfIndex === -1) {
      return res.status(404).json({ error: 'PDF not found' });
    }
    
    const pdf = pdfsDatabase[pdfIndex];
    
    // Set status to processing
    pdfsDatabase[pdfIndex].ragStatus = 'processing';
    pdfsDatabase[pdfIndex].ragError = null;
    saveDatabase();
    
    // Delete existing chunks first
    try {
      await fetch(`${RAG_SERVICE_URL}/document/${pdf.id}`, { method: 'DELETE' });
    } catch (e) {
      // Ignore delete errors
    }
    
    // Parse processing options from request body
    let processingOptions = {};
    let rechunkOnly = false;
    if (req.body) {
      if (req.body.processingOptions) {
        try {
          processingOptions = typeof req.body.processingOptions === 'string' 
            ? JSON.parse(req.body.processingOptions) 
            : req.body.processingOptions;
          console.log('[Reprocess] Processing options:', processingOptions);
          // Extract rechunkOnly from processingOptions
          rechunkOnly = processingOptions.rechunkOnly === true;
        } catch (e) {
          console.warn('[Reprocess] Failed to parse processingOptions:', e.message);
        }
      }
    }
    
    if (rechunkOnly) {
      // Rechunk only - use cached extraction
      console.log(`[Reprocess] Rechunk only mode for ${pdf.id}`);
      rechunkPdf(pdf.id, processingOptions).catch(err => {
        console.error(`Error rechunking PDF ${pdf.id}:`, err.message);
      });
    } else {
      // Full reprocess
      processPdfWithRag(pdf, processingOptions).catch(err => {
        console.error(`Error reprocessing PDF ${pdf.id}:`, err.message);
      });
    }
    
    res.json({ success: true, message: rechunkOnly ? 'Rechunking started' : 'Reprocessing started' });
  } catch (error) {
    console.error('Error reprocessing PDF:', error);
    res.status(500).json({ error: error.message });
  }
});

// Rechunk PDF using cached extraction
async function rechunkPdf(pdfId, processingOptions = {}) {
  try {
    const response = await fetch(`${RAG_SERVICE_URL}/rechunk/${pdfId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        pdf_id: pdfId,
        chunker_mode: processingOptions.chunker_mode || null,
        merge_window: processingOptions.merge_window !== undefined ? processingOptions.merge_window : null
      })
    });
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`RAG service error: ${error}`);
    }
    
    const result = await response.json();
    console.log(`Rechunked ${pdfId}: ${result.chunks_created} chunks`);
    
    // Update PDF with new chunk count
    const pdfIndex = pdfsDatabase.findIndex(p => p.id === pdfId);
    if (pdfIndex !== -1) {
      pdfsDatabase[pdfIndex].ragStatus = 'success';
      pdfsDatabase[pdfIndex].ragError = null;
      pdfsDatabase[pdfIndex].chunksCount = result.chunks_created;
      saveDatabase();
    }
    
    return result;
  } catch (error) {
    console.error(`Error rechunking PDF ${pdfId}:`, error.message);
    
    const pdfIndex = pdfsDatabase.findIndex(p => p.id === pdfId);
    if (pdfIndex !== -1) {
      pdfsDatabase[pdfIndex].ragStatus = 'failed';
      pdfsDatabase[pdfIndex].ragError = error.message;
      saveDatabase();
    }
    
    throw error;
  }
}

// Error handling middleware
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File size too large. Maximum size is 10MB' });
    }
    return res.status(400).json({ error: error.message });
  }
  
  if (error) {
    return res.status(400).json({ error: error.message });
  }
  
  next();
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Uploads directory: ${uploadsDir}`);
});
