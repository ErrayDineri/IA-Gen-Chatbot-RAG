# GitHub Copilot Instructions for PDF Library Manager

## Project Overview
This is a full-stack PDF Library Manager application with a React frontend and Node.js/Express backend. Users can upload PDF files, tag them, and browse through their library.

## Design System

### Color Theme
Use the following color palette throughout the application:

**Primary Colors:**
- Main Theme Color: `#B8D8D8` (Soft blue-gray)
- Secondary Color: `#7A9E9F` (Muted teal)
- Accent Color: `#A27E8E` (Dusty rose)

**Color Usage Guidelines:**
- Use `#B8D8D8` for primary backgrounds, hover states, and main UI elements
- Use `#7A9E9F` for secondary buttons, borders, and complementary elements
- Use `#A27E8E` for accents, highlights, tags, and call-to-action elements

### Component Styling
- Apply the color theme consistently across all React components
- Use gradients combining theme colors for visual depth
- Maintain proper contrast ratios for accessibility

## Code Standards

### Frontend (React)
- Use functional components with hooks
- Keep components modular and reusable
- Use CSS modules or separate CSS files for styling
- Follow React best practices for state management
- Use axios for API calls

### Backend (Node.js/Express)
- Implement RESTful API patterns
- Use proper error handling middleware
- Validate file uploads (type and size)
- Keep routes organized and documented
- Use async/await for asynchronous operations

## File Structure
- Frontend code in `/frontend` directory
- Backend code in `/backend` directory
- PDF uploads stored in `/backend/uploads`
- Use JSON file for data persistence (database.json)

## Features to Maintain
- Drag and drop file upload
- Tag management (add, edit, remove)
- PDF library grid view with scrolling
- File validation (PDF only, max 10MB)
- Delete functionality with confirmation
- View PDFs in new tab

## Important Notes
- Do NOT create README files
- Maintain consistent color theme across all new components
- Keep the UI modern and user-friendly
- Ensure responsive design for different screen sizes
- Preserve existing functionality when adding new features
