import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import './Chatbot.css';

function Chatbot() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([
    { id: 1, text: "Hello! How can I help you with your PDF library today?", sender: 'bot' }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [size, setSize] = useState(() => {
    const saved = localStorage.getItem('chatbot-size');
    return saved ? JSON.parse(saved) : { width: 380, height: 500 };
  });
  const [isResizing, setIsResizing] = useState(false);
  const [chatHistory, setChatHistory] = useState([]);
  const [currentChatId, setCurrentChatId] = useState(null);
  const [showHistory, setShowHistory] = useState(false);
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

  // Load chat history on mount
  useEffect(() => {
    fetchChatHistory();
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const clearChat = () => {
    setMessages([
      { id: 1, text: "Hello! How can I help you with your PDF library today?", sender: 'bot' }
    ]);
    setCurrentChatId(null);
  };

  // Save size preference
  useEffect(() => {
    localStorage.setItem('chatbot-size', JSON.stringify(size));
  }, [size]);

  const saveCurrentChat = async () => {
    if (messages.length <= 1) return; // Don't save empty chats
    
    const chatName = messages.find(m => m.sender === 'user')?.text.slice(0, 30) || 'New Chat';
    const chatData = {
      id: currentChatId || Date.now().toString(),
      name: chatName + (chatName.length >= 30 ? '...' : ''),
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
    setShowHistory(false);
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

  const newChat = () => {
    saveCurrentChat();
    clearChat();
    setShowHistory(false);
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
      // Build conversation history for context
      const conversationHistory = messages
        .filter(msg => msg.text) // Only include messages with content
        .map(msg => ({
          role: msg.sender === 'user' ? 'user' : 'assistant',
          content: msg.text
        }));
      
      // Add the current user message
      conversationHistory.push({ role: 'user', content: userInput });

      const response = await fetch('http://127.0.0.1:8000/chat/regular/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: conversationHistory,
          config: {
            temperature: 0.7,
            limit: 1024
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
                setMessages(prev => [...prev, { id: botMessageId, text: fullText, sender: 'bot' }]);
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
                <span className="chatbot-status">Online</span>
              </div>
            </div>
            <div className="chatbot-header-actions">
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

          {showHistory && (
            <div className="chat-history-panel">
              <div className="chat-history-header">
                <h4>Chat History</h4>
                <span className="chat-count">{chatHistory.length} saved</span>
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
    </div>
  );
}

export default Chatbot;
