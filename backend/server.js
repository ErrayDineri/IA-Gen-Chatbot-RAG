const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 5000;

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
        uploadedAt: new Date().toISOString()
      };
      pdfsDatabase.push(pdfData);
      return pdfData;
    });

    saveDatabase();

    res.status(201).json({
      message: `${uploadedPdfs.length} PDF(s) uploaded successfully`,
      pdfs: uploadedPdfs
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Error uploading files' });
  }
});

// Update PDF tags
app.put('/api/pdfs/:id/tags', (req, res) => {
  const pdfIndex = pdfsDatabase.findIndex(p => p.id === req.params.id);
  
  if (pdfIndex === -1) {
    return res.status(404).json({ error: 'PDF not found' });
  }

  pdfsDatabase[pdfIndex].tags = req.body.tags || [];
  saveDatabase();

  res.json({
    message: 'Tags updated successfully',
    pdf: pdfsDatabase[pdfIndex]
  });
});

// Delete PDF
app.delete('/api/pdfs/:id', (req, res) => {
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

  // Remove from database
  pdfsDatabase.splice(pdfIndex, 1);
  saveDatabase();

  res.json({ message: 'PDF deleted successfully' });
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
