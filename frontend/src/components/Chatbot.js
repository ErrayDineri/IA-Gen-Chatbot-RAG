import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import './Chatbot.css';

function Chatbot() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([
    { id: 1, text: "Hello! How can I help you with your PDF library today? You can enable RAG mode to search through your documents.", sender: 'bot' }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [size, setSize] = useState(() => {
    const saved = localStorage.getItem('chatbot-size');
    return saved ? JSON.parse(saved) : { width: 420, height: 550 };
  });
  const [isResizing, setIsResizing] = useState(false);
  const [chatHistory, setChatHistory] = useState([]);
  const [currentChatId, setCurrentChatId] = useState(null);
  const [showHistory, setShowHistory] = useState(false);
  
  // RAG state
  const [ragEnabled, setRagEnabled] = useState(false);
  const [ragAvailable, setRagAvailable] = useState(false);
  const [availableTags, setAvailableTags] = useState([]);
  const [selectedTags, setSelectedTags] = useState([]);
  const [showTagFilter, setShowTagFilter] = useState(false);
  
  const messagesEndRef = useRef(null);
  const chatContainerRef = useRef(null);
  const resizeRef = useRef({ startX: 0, startY: 0, startWidth: 0, startHeight: 0 });

  // Fetch chat history from backend
  const fetchChatHistory = async () => {
    try {
      const response = await fetch('http://localhost:5000/api/chats');
      if (response.ok) {
        const data = await response.json();
        setChatHistory(data);
      }
    } catch (error) {
      console.error('Error fetching chat history:', error);
    }
  };

  // Check RAG service status and fetch tags
  const checkRagStatus = async () => {
    try {
      const response = await fetch('http://localhost:5000/api/rag/status');
      if (response.ok) {
        const data = await response.json();
        setRagAvailable(data.available);
        if (data.available && data.available_tags) {
          setAvailableTags(data.available_tags);
        }
      }
    } catch (error) {
      console.error('Error checking RAG status:', error);
      setRagAvailable(false);
    }
  };

  // Fetch available tags from RAG service
  const fetchRagTags = async () => {
    try {
      const response = await fetch('http://localhost:5000/api/rag/tags');
      if (response.ok) {
        const data = await response.json();
        setAvailableTags(data.tags || []);
      }
    } catch (error) {
      console.error('Error fetching RAG tags:', error);
    }
  };

  // Load chat history and check RAG on mount
  useEffect(() => {
    fetchChatHistory();
    checkRagStatus();
  }, []);

  // Refresh tags when RAG is enabled
  useEffect(() => {
    if (ragEnabled) {
      fetchRagTags();
    }
  }, [ragEnabled]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const clearChat = () => {
    setMessages([
      { id: 1, text: "Hello! How can I help you with your PDF library today? You can enable RAG mode to search through your documents.", sender: 'bot' }
    ]);
    setCurrentChatId(null);
  };

  // Toggle tag selection
  const toggleTag = (tag) => {
    setSelectedTags(prev => 
      prev.includes(tag) 
        ? prev.filter(t => t !== tag)
        : [...prev, tag]
    );
  };

  // Toggle tag filter panel and refresh tags
  const toggleTagFilter = () => {
    if (!showTagFilter) {
      fetchRagTags(); // Refresh tags when opening
    }
    setShowTagFilter(!showTagFilter);
  };

  // Save size preference
  useEffect(() => {
    localStorage.setItem('chatbot-size', JSON.stringify(size));
  }, [size]);

  // Generate a short chat name using AI
  const generateChatName = async (messages) => {
    if (!messages || messages.length <= 1) return 'New Chat';
    
    // Get conversation summary (first few exchanges)
    const convSummary = messages
      .filter(m => m.sender === 'user')
      .slice(0, 2)
      .map(m => m.text)
      .join(' | ');
    
    if (!convSummary) return 'New Chat';
    
    try {
      const response = await fetch('http://127.0.0.1:8000/chat/regular/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            {
              role: 'user',
              content: `Give a 2-3 word title for this conversation. Reply with ONLY the title, nothing else. No quotes, no punctuation, no explanation.

Conversation: "${convSummary}"`
            }
          ],
          config: { temperature: 0.3, limit: 20 }
        })
      });

      if (!response.ok) throw new Error('Failed');
      
      // Read the stream to get the title
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let title = '';
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n').filter(line => line.trim());
        
        for (const line of lines) {
          try {
            const data = JSON.parse(line);
            if (data.content) title += data.content;
          } catch (e) {}
        }
      }
      
      // Clean up the title
      title = title.trim().replace(/^["']|["']$/g, '').slice(0, 30);
      return title || 'New Chat';
      
    } catch (error) {
      console.error('Error generating chat name:', error);
      // Fallback: use first few words of first message
      const firstMsg = messages.find(m => m.sender === 'user')?.text || '';
      return firstMsg.split(' ').slice(0, 3).join(' ').slice(0, 25) || 'New Chat';
    }
  };

  const saveCurrentChat = async () => {
    if (messages.length <= 1) return; // Don't save empty chats
    
    const chatName = await generateChatName(messages);
    const chatData = {
      id: currentChatId || Date.now().toString(),
      name: chatName,
      messages: messages,
      date: new Date().toISOString()
    };

    try {
      const response = await fetch('http://localhost:5000/api/chats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(chatData)
      });
      
      if (response.ok) {
        const savedChat = await response.json();
        setCurrentChatId(savedChat.id);
        fetchChatHistory();
      }
    } catch (error) {
      console.error('Error saving chat:', error);
    }
  };

  const loadChat = (chat) => {
    setMessages(chat.messages);
    setCurrentChatId(chat.id);
    // Don't close history panel when loading a chat
  };

  const deleteChat = async (chatId, e) => {
    e.stopPropagation();
    try {
      const response = await fetch(`http://localhost:5000/api/chats/${chatId}`, {
        method: 'DELETE'
      });
      
      if (response.ok) {
        fetchChatHistory();
        if (currentChatId === chatId) {
          clearChat();
        }
      }
    } catch (error) {
      console.error('Error deleting chat:', error);
    }
  };

  const newChat = async () => {
    await saveCurrentChat();
    clearChat();
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Resize handlers
  const handleResizeStart = (e, direction) => {
    e.preventDefault();
    setIsResizing(true);
    resizeRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startWidth: size.width,
      startHeight: size.height,
      direction
    };

    document.addEventListener('mousemove', handleResizeMove);
    document.addEventListener('mouseup', handleResizeEnd);
  };

  const handleResizeMove = (e) => {
    if (!resizeRef.current) return;

    const { startX, startY, startWidth, startHeight, direction } = resizeRef.current;
    
    let newWidth = startWidth;
    let newHeight = startHeight;

    const maxWidth = window.innerWidth - 40;
    const maxHeight = window.innerHeight - 100;

    if (direction.includes('left')) {
      newWidth = Math.max(300, Math.min(maxWidth, startWidth + (startX - e.clientX)));
    }
    if (direction.includes('top')) {
      newHeight = Math.max(350, Math.min(maxHeight, startHeight + (startY - e.clientY)));
    }

    setSize({ width: newWidth, height: newHeight });
  };

  const handleResizeEnd = () => {
    setIsResizing(false);
    document.removeEventListener('mousemove', handleResizeMove);
    document.removeEventListener('mouseup', handleResizeEnd);
  };

  useEffect(() => {
    return () => {
      document.removeEventListener('mousemove', handleResizeMove);
      document.removeEventListener('mouseup', handleResizeEnd);
    };
  }, []);

  const handleSendMessage = async (e) => {
    e.preventDefault();
    
    if (!inputValue.trim()) return;

    const userMessage = {
      id: Date.now(),
      text: inputValue,
      sender: 'user'
    };

    setMessages(prev => [...prev, userMessage]);
    const userInput = inputValue;
    setInputValue('');
    setIsLoading(true);

    // Bot message ID for streaming
    const botMessageId = Date.now() + 1;

    try {
      let ragContext = '';
      let sources = [];
      
      // If RAG is enabled, query for relevant context
      if (ragEnabled && ragAvailable) {
        try {
          const ragResponse = await fetch('http://localhost:5000/api/rag/query', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              query: userInput,
              tags: selectedTags.length > 0 ? selectedTags : null,
              top_k: 5
            })
          });
          
          if (ragResponse.ok) {
            const ragData = await ragResponse.json();
            if (ragData.results && ragData.results.length > 0) {
              // Build context from retrieved chunks
              ragContext = ragData.results.map((r, i) => 
                `[Source ${i + 1}: ${r.metadata.filename}, Page ${r.metadata.page_num}]\n${r.text}`
              ).join('\n\n---\n\n');
              
              sources = ragData.results.map(r => ({
                filename: r.metadata.filename,
                page: r.metadata.page_num,
                similarity: r.similarity
              }));
            }
          }
        } catch (ragError) {
          console.error('RAG query failed:', ragError);
        }
      }
      
      // Build conversation history for context
      const conversationHistory = messages
        .filter(msg => msg.text && !msg.sources) // Exclude source metadata
        .map(msg => ({
          role: msg.sender === 'user' ? 'user' : 'assistant',
          content: msg.text
        }));
      
      // Build the final user message with RAG context
      let finalUserContent = userInput;
      if (ragContext) {
        finalUserContent = `Use the following context from the user's documents to answer their question. Respond in the SAME LANGUAGE as the user's question.

CONTEXT:
${ragContext}

QUESTION: ${userInput}

Instructions: Answer based on the context above. Cite sources (filename, page) when relevant. If the context doesn't help, say so briefly and give a general answer. Match the user's language.`;
      }
      
      conversationHistory.push({ role: 'user', content: finalUserContent });

      const response = await fetch('http://127.0.0.1:8000/chat/regular/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: conversationHistory,
          config: {
            temperature: 0.7,
            limit: 2048
          }
        })
      });

      if (!response.ok) {
        throw new Error('Failed to get response from LLM');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullText = '';
      let messageCreated = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n').filter(line => line.trim());

        for (const line of lines) {
          try {
            const data = JSON.parse(line);
            if (data.content) {
              fullText += data.content;
              
              if (!messageCreated) {
                // Create bot message on first content and hide typing indicator
                setIsLoading(false);
                setMessages(prev => [...prev, { 
                  id: botMessageId, 
                  text: fullText, 
                  sender: 'bot',
                  sources: sources.length > 0 ? sources : null
                }]);
                messageCreated = true;
              } else {
                // Update existing bot message
                setMessages(prev => prev.map(msg => 
                  msg.id === botMessageId 
                    ? { ...msg, text: fullText }
                    : msg
                ));
              }
            }
          } catch (parseError) {
            // Skip non-JSON lines
          }
        }
      }

      setIsLoading(false);
    } catch (error) {
      console.error('Error sending message:', error);
      setIsLoading(false);
      setMessages(prev => [...prev, {
        id: botMessageId,
        text: "Sorry, I couldn't connect to the AI service. Please make sure LM Studio is running.",
        sender: 'bot'
      }]);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage(e);
    }
    // Shift+Enter allows newline naturally
  };

  return (
    <div className="chatbot-wrapper">
      {/* Chat Button */}
      <button 
        className={`chatbot-button ${isOpen ? 'open' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        title={isOpen ? 'Close chat' : 'Open chat'}
      >
        {isOpen ? (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        ) : (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
        )}
      </button>

      {/* Chat Window */}
      {isOpen && (
        <div 
          className={`chatbot-container ${isResizing ? 'resizing' : ''}`}
          ref={chatContainerRef}
          style={{ width: size.width, height: size.height }}
        >
          {/* Resize handles */}
          <div 
            className="resize-handle resize-left"
            onMouseDown={(e) => handleResizeStart(e, 'left')}
          />
          <div 
            className="resize-handle resize-top"
            onMouseDown={(e) => handleResizeStart(e, 'top')}
          />
          <div 
            className="resize-handle resize-corner"
            onMouseDown={(e) => handleResizeStart(e, 'top-left')}
          />
          
          <div className="chatbot-header">
            <div className="chatbot-header-info">
              <span className="chatbot-avatar">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <circle cx="12" cy="12" r="10"/>
                  <path d="M8 14s1.5 2 4 2 4-2 4-2"/>
                  <line x1="9" y1="9" x2="9.01" y2="9"/>
                  <line x1="15" y1="9" x2="15.01" y2="9"/>
                </svg>
              </span>
              <div>
                <h3>PDF Assistant</h3>
                <span className={`chatbot-status ${ragEnabled ? 'rag-active' : ''}`}>
                  {ragEnabled ? 'RAG Active' : 'Online'}
                </span>
              </div>
            </div>
            <div className="chatbot-header-actions">
              <button 
                className={`chatbot-rag-btn ${ragEnabled ? 'active' : ''} ${!ragAvailable ? 'disabled' : ''}`}
                onClick={() => ragAvailable && setRagEnabled(!ragEnabled)}
                title={ragAvailable ? (ragEnabled ? 'Disable RAG' : 'Enable RAG') : 'RAG service unavailable'}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8"/>
                  <path d="M21 21l-4.35-4.35"/>
                </svg>
              </button>
              {ragEnabled && (
                <button 
                  className={`chatbot-filter-btn ${showTagFilter ? 'active' : ''}`}
                  onClick={() => setShowTagFilter(!showTagFilter)}
                  title="Filter by tags"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
                  </svg>
                  {selectedTags.length > 0 && (
                    <span className="filter-badge">{selectedTags.length}</span>
                  )}
                </button>
              )}
              <button 
                className="chatbot-history-btn" 
                onClick={() => setShowHistory(!showHistory)}
                title="Chat history"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/>
                  <polyline points="12 6 12 12 16 14"/>
                </svg>
              </button>
              <button 
                className="chatbot-new" 
                onClick={newChat}
                title="New chat"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="12" y1="5" x2="12" y2="19"/>
                  <line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
              </button>
              <button 
                className="chatbot-save" 
                onClick={saveCurrentChat}
                title="Save chat"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                  <polyline points="17 21 17 13 7 13 7 21"/>
                  <polyline points="7 3 7 8 15 8"/>
                </svg>
              </button>
              <button className="chatbot-close" onClick={() => setIsOpen(false)} title="Close">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"/>
                  <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
          </div>

          {/* Tag Filter Panel */}
          {showTagFilter && ragEnabled && (
            <div className="tag-filter-panel">
              <div className="tag-filter-header">
                <h4>Filter by Tags</h4>
                {selectedTags.length > 0 && (
                  <button 
                    className="clear-tags-btn"
                    onClick={() => setSelectedTags([])}
                  >
                    Clear all
                  </button>
                )}
              </div>
              {availableTags.length === 0 ? (
                <p className="no-tags-message">No tags available. Upload PDFs with tags to filter.</p>
              ) : (
                <div className="tag-filter-list">
                  {availableTags.map(tag => (
                    <button
                      key={tag}
                      className={`tag-filter-item ${selectedTags.includes(tag) ? 'selected' : ''}`}
                      onClick={() => toggleTag(tag)}
                    >
                      {tag}
                      {selectedTags.includes(tag) && (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                          <polyline points="20 6 9 17 4 12"/>
                        </svg>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="chatbot-messages">
            {messages.map((message) => (
              <div 
                key={message.id} 
                className={`message ${message.sender}`}
              >
                {message.sender === 'bot' && (
                  <span className="message-avatar">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <circle cx="12" cy="12" r="10"/>
                      <path d="M8 14s1.5 2 4 2 4-2 4-2"/>
                      <line x1="9" y1="9" x2="9.01" y2="9"/>
                      <line x1="15" y1="9" x2="15.01" y2="9"/>
                    </svg>
                  </span>
                )}
                <div className="message-content">
                  {message.sender === 'bot' ? (
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.text}</ReactMarkdown>
                  ) : (
                    <p>{message.text}</p>
                  )}
                  {message.sources && message.sources.length > 0 && (
                    <div className="rag-sources">
                      <div className="sources-header">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                          <polyline points="14 2 14 8 20 8"/>
                        </svg>
                        <span>Sources ({message.sources.length})</span>
                      </div>
                      <div className="sources-list">
                        {message.sources.map((source, idx) => (
                          <div key={idx} className="source-item">
                            <span className="source-filename">{source.filename}</span>
                            {source.page && <span className="source-page">Page {source.page}</span>}
                            {source.tags && <span className="source-tags">{source.tags}</span>}
                            <span className="source-similarity">{Math.round(source.similarity * 100)}%</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="message bot">
                <span className="message-avatar">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <circle cx="12" cy="12" r="10"/>
                    <path d="M8 14s1.5 2 4 2 4-2 4-2"/>
                    <line x1="9" y1="9" x2="9.01" y2="9"/>
                    <line x1="15" y1="9" x2="15.01" y2="9"/>
                  </svg>
                </span>
                <div className="message-content">
                  <div className="typing-indicator">
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <form className="chatbot-input-form" onSubmit={handleSendMessage}>
            <textarea
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyPress}
              placeholder="Type your message... (Shift+Enter for new line)"
              className="chatbot-input"
              disabled={isLoading}
              rows={1}
            />
            <button 
              type="submit" 
              className="chatbot-send-btn"
              disabled={!inputValue.trim() || isLoading}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="22" y1="2" x2="11" y2="13"/>
                <polygon points="22 2 15 22 11 13 2 9 22 2"/>
              </svg>
            </button>
          </form>
        </div>
      )}

      {/* Chat History Sidebar - appears to the left of chat */}
      {isOpen && showHistory && (
        <div className="chat-history-sidebar">
          <div className="chat-history-header">
            <h4>Chat History</h4>
            <button 
              className="close-history-btn"
              onClick={() => setShowHistory(false)}
              title="Close"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
          {chatHistory.length === 0 ? (
            <p className="no-history">No saved chats yet</p>
          ) : (
            <div className="chat-history-list">
              {chatHistory.map(chat => (
                <div 
                  key={chat.id} 
                  className={`chat-history-item ${currentChatId === chat.id ? 'active' : ''}`}
                  onClick={() => loadChat(chat)}
                >
                  <div className="chat-history-info">
                    <span className="chat-history-name">{chat.name}</span>
                    <span className="chat-history-date">
                      {new Date(chat.date).toLocaleDateString()}
                    </span>
                  </div>
                  <button 
                    className="chat-history-delete"
                    onClick={(e) => deleteChat(chat.id, e)}
                    title="Delete chat"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="3 6 5 6 21 6"/>
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default Chatbot;
