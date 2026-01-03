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
  const [size, setSize] = useState({ width: 380, height: 500 });
  const [isResizing, setIsResizing] = useState(false);
  const messagesEndRef = useRef(null);
  const chatContainerRef = useRef(null);
  const resizeRef = useRef({ startX: 0, startY: 0, startWidth: 0, startHeight: 0 });

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const clearChat = () => {
    setMessages([
      { id: 1, text: "Hello! How can I help you with your PDF library today?", sender: 'bot' }
    ]);
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
        {isOpen ? '✕' : '💬'}
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
              <span className="chatbot-avatar">🤖</span>
              <div>
                <h3>PDF Assistant</h3>
                <span className="chatbot-status">Online</span>
              </div>
            </div>
            <div className="chatbot-header-actions">
              <button 
                className="chatbot-clear" 
                onClick={clearChat}
                title="Clear chat"
              >
                🗑️
              </button>
              <button className="chatbot-close" onClick={() => setIsOpen(false)}>✕</button>
            </div>
          </div>

          <div className="chatbot-messages">
            {messages.map((message) => (
              <div 
                key={message.id} 
                className={`message ${message.sender}`}
              >
                {message.sender === 'bot' && <span className="message-avatar">🤖</span>}
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
                <span className="message-avatar">🤖</span>
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
              ➤
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

export default Chatbot;
