# PDF Library Manager

A full-stack application for uploading, tagging, and managing PDF documents.

## Project Structure

```
RAGChat/
├── frontend/          # React frontend application
│   ├── src/
│   │   ├── components/
│   │   │   ├── PDFUpload.js      # PDF upload component with drag & drop
│   │   │   ├── PDFUpload.css
│   │   │   ├── PDFLibrary.js     # PDF library grid view
│   │   │   └── PDFLibrary.css
│   │   ├── App.js
│   │   ├── App.css
│   │   ├── index.js
│   │   └── index.css
│   ├── public/
│   └── package.json
│
└── backend/           # Node.js/Express backend
    ├── uploads/       # PDF storage directory (auto-created)
    ├── server.js      # Express server with API endpoints
    ├── database.json  # JSON file database (auto-created)
    └── package.json
```

## Features

### Frontend
- 📤 **Drag & Drop Upload**: Easy PDF file upload with visual feedback
- 🏷️ **Tagging System**: Add and edit tags for each PDF
- 📚 **Library View**: Scrollable grid display of all PDFs
- 🎨 **Modern UI**: Beautiful gradient design with smooth animations
- 🗑️ **Delete PDFs**: Remove unwanted documents
- 👁️ **View PDFs**: Open PDFs in a new tab

### Backend
- 🚀 **Express Server**: RESTful API for PDF management
- 💾 **File Storage**: PDFs stored in the `uploads` folder
- 🗃️ **JSON Database**: Simple file-based database for metadata
- ✅ **Validation**: File type and size validation
- 🔒 **Error Handling**: Comprehensive error handling

## Installation

### Prerequisites
- Node.js (v14 or higher)
- npm or yarn

### Backend Setup

1. Navigate to the backend folder:
   ```powershell
   cd backend
   ```

2. Install dependencies:
   ```powershell
   npm install
   ```

3. Start the server:
   ```powershell
   npm start
   ```
   
   Or for development with auto-restart:
   ```powershell
   npm run dev
   ```

The backend server will run on `http://localhost:5000`

### Frontend Setup

1. Navigate to the frontend folder:
   ```powershell
   cd frontend
   ```

2. Install dependencies:
   ```powershell
   npm install
   ```

3. Start the development server:
   ```powershell
   npm start
   ```

The frontend will run on `http://localhost:3000`

## API Endpoints

### GET `/api/pdfs`
Get all PDFs in the library

**Response:**
```json
[
  {
    "id": "uuid",
    "filename": "document.pdf",
    "storedFilename": "1234567890-uuid.pdf",
    "size": 1048576,
    "url": "/uploads/1234567890-uuid.pdf",
    "tags": ["important", "2024"],
    "uploadedAt": "2026-01-03T10:00:00.000Z"
  }
]
```

### POST `/api/upload`
Upload a new PDF

**Request:**
- Method: POST
- Content-Type: multipart/form-data
- Body:
  - `pdf`: PDF file
  - `tags`: Comma-separated tags (optional)

**Response:**
```json
{
  "message": "PDF uploaded successfully",
  "pdf": { ... }
}
```

### PUT `/api/pdfs/:id/tags`
Update tags for a PDF

**Request:**
```json
{
  "tags": ["tag1", "tag2"]
}
```

**Response:**
```json
{
  "message": "Tags updated successfully",
  "pdf": { ... }
}
```

### DELETE `/api/pdfs/:id`
Delete a PDF

**Response:**
```json
{
  "message": "PDF deleted successfully"
}
```

## Usage

1. **Upload a PDF:**
   - Drag and drop a PDF file into the upload area, or click "Browse Files"
   - Optionally add tags (comma-separated)
   - Click "Upload PDF"

2. **View PDFs:**
   - All uploaded PDFs appear in the library grid
   - Each card shows the filename, size, upload date, and tags
   - Click "View PDF" to open the document in a new tab

3. **Manage Tags:**
   - Click the edit icon (✏️) on a PDF card
   - Modify the tags (comma-separated)
   - Click "Save" to update

4. **Delete PDFs:**
   - Click the delete icon (🗑️) on a PDF card
   - Confirm the deletion

## Technical Details

### Frontend Technologies
- React 18
- Axios for API calls
- CSS3 with gradients and animations
- Responsive grid layout

### Backend Technologies
- Node.js
- Express.js
- Multer for file uploads
- UUID for unique identifiers
- CORS for cross-origin requests

### File Limits
- Maximum file size: 10MB
- Accepted format: PDF only

## Future Enhancements

Potential features to add:
- 🔍 Search and filter functionality
- 📁 Folder/category organization
- 👥 User authentication and multi-user support
- 📊 PDF preview thumbnails
- 💾 Database migration to MongoDB/PostgreSQL
- ☁️ Cloud storage integration (AWS S3, etc.)
- 📱 Mobile-responsive improvements

## License

MIT
