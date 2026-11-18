'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Badge } from '@/components/ui/Badge.js';
import { Button } from '@/components/ui/Button.js';
import { MessageSquare, X, Send, Sparkles, Bot, User, CornerDownLeft } from 'lucide-react';

const SUGGESTION_CHIPS = [
  'What is traceability?',
  'What do the 4 statuses mean?',
  'Base vs Advance model?',
  'How do I get started?',
];

function generateResponse(input) {
  const q = (input || '').trim().toLowerCase();

  if (!q) {
    return 'Please enter a question so I can assist you.';
  }

  // 1. Traceability
  if (q.includes('trace') || q.includes('traceability')) {
    return `Traceability in GENESIS is the rigorous, evidence-grounded mapping between client requirements (extracted from SRS specifications) and actual developer source code (functions, classes, endpoints, AST symbols, and test suites).\n\nIt guarantees that requirements are verified against deterministic code evidence with zero hallucination.`;
  }

  // 2. 4 statuses
  if (
    q.includes('status') ||
    q.includes('verified') ||
    q.includes('partially') ||
    q.includes('partial') ||
    q.includes('not implemented') ||
    q.includes('unverified') ||
    q.includes('meaning')
  ) {
    return `GENESIS assigns one of four mutually exclusive canonical statuses to every requirement:\n\n• VERIFIED: Substantive matching code evidence and functional implementation are verified.\n• PARTIALLY IMPLEMENTED: Code stubs, incomplete endpoints, or partial logic are present.\n• NOT IMPLEMENTED: Static analysis confirms complete absence of related code, routes, or tests.\n• UNVERIFIED: Insufficient deterministic evidence to make a definitive judgment without guessing.`;
  }

  // 3. Base vs Advance model
  if (
    q.includes('base') ||
    q.includes('advance') ||
    q.includes('model') ||
    q.includes('difference') ||
    q.includes('fallback') ||
    q.includes('capacity') ||
    q.includes('quota')
  ) {
    return `Base Genesis Model = rule-based checker, Advance Genesis Model = Google Gemini, with Base as automatic fallback when AI quota runs out.\n\nThe Advance Genesis Model performs deep contextual semantic reasoning, while the Base Genesis Model ensures reliable, uninterrupted offline verification.`;
  }

  // 4. How to start / workflow
  if (
    q.includes('start') ||
    q.includes('workflow') ||
    q.includes('step') ||
    q.includes('how to') ||
    q.includes('begin') ||
    q.includes('guide') ||
    q.includes('process')
  ) {
    return `To verify a software project in GENESIS, follow the 5-phase sequential workflow:\n\n1. SRS Upload: Upload a client specification (PDF or DOCX).\n2. Requirements: Review, edit, and approve extracted requirements.\n3. Code: Upload developer source code as a ZIP archive.\n4. Matrix: Execute the verification run to map requirements to code evidence.\n5. Report: Generate and download the formal audit PDF report.`;
  }

  // 5. Evidence-grounded verdict
  if (
    q.includes('evidence') ||
    q.includes('verdict') ||
    q.includes('grounded') ||
    q.includes('guarantee') ||
    q.includes('hallucinat')
  ) {
    return `An evidence-grounded verdict means every verification decision is strictly anchored to deterministic source-code evidence — exact file paths, line ranges, and parsed AST symbols.\n\nGENESIS enforces zero fabrication: absence of code never implies completion, and ambiguous evidence produces UNVERIFIED rather than a guess.`;
  }

  // 6. What can this assistant do
  if (
    q.includes('what can') ||
    q.includes('who are you') ||
    q.includes('help') ||
    q.includes('capabilit') ||
    q.includes('feature') ||
    q.includes('about')
  ) {
    return `I am the GENESIS Preview Assistant! I can explain core concepts of the verification framework, describe the 4 canonical verification statuses, clarify the difference between the Base and Advance Genesis Models, guide you through the 5-phase workflow, and explain our evidence-grounding standards.\n\n(Note: In this preview release, I respond via local rule-matching without external AI calls.)`;
  }

  // Default reply
  return `This is a preview assistant running local topic matching without external AI calls.\n\nI can answer questions on the following topics:\n• What is traceability?\n• What the 4 statuses mean (Verified, Partially Implemented, Not Implemented, Unverified)\n• Base vs Advance model (Base Genesis Model = rule-based checker, Advance Genesis Model = Google Gemini, with Base as automatic fallback when AI quota runs out)\n• How to start (SRS → Requirements → Code → Matrix → Report)\n• What is an evidence-grounded verdict\n• What can this assistant do\n\nClick any suggestion chip below or type a question about these topics!`;
}

export function AskGenesis() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([
    {
      id: 'welcome',
      sender: 'assistant',
      text: `Hello! I am the GENESIS Assistant (Preview). Ask me about requirements traceability, the 4 verification statuses, Base vs Advance models, or how to get started.`,
    },
  ]);
  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  const handleSendMessage = (textToSend) => {
    const text = (textToSend || inputText).trim();
    if (!text) return;

    const userMsg = {
      id: `u_${Date.now()}`,
      sender: 'user',
      text,
    };

    const replyText = generateResponse(text);
    const botMsg = {
      id: `b_${Date.now() + 1}`,
      sender: 'assistant',
      text: replyText,
    };

    setMessages((prev) => [...prev, userMsg, botMsg]);
    setInputText('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-40">
      {/* Floating Action Button */}
      {!isOpen && (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="flex items-center gap-2.5 bg-navy-900 hover:bg-slate-900 text-white pl-4 pr-3 py-2.5 rounded-full shadow-lg hover:shadow-xl transition-all border border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 group cursor-pointer"
          aria-label="Open Ask GENESIS Assistant"
        >
          <div className="w-5 h-5 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400 group-hover:text-blue-300">
            <Sparkles className="w-3.5 h-3.5" />
          </div>
          <span className="text-xs font-semibold tracking-tight text-white">Ask GENESIS</span>
          <Badge variant="warning" size="sm" className="ml-0.5">
            Preview
          </Badge>
        </button>
      )}

      {/* Chat Window Panel */}
      {isOpen && (
        <div
          className="w-96 max-w-[calc(100vw-2rem)] h-[520px] max-h-[85vh] bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col animate-in fade-in slide-in-from-bottom-4 duration-200"
          role="dialog"
          aria-label="Ask GENESIS Assistant"
        >
          {/* Header */}
          <div className="px-4 py-3 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800 shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-md bg-blue-500/20 text-blue-400 flex items-center justify-center">
                <Sparkles className="w-3.5 h-3.5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-xs font-bold text-white tracking-tight">Ask GENESIS</h3>
                  <Badge variant="warning" size="sm">
                    Preview
                  </Badge>
                </div>
                <p className="text-[10px] text-slate-400">Offline Framework Assistant</p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition-colors focus:outline-none"
              aria-label="Close assistant panel"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto p-3.5 space-y-3 bg-slate-50/60 text-xs">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-2 ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {msg.sender === 'assistant' && (
                  <div className="w-6 h-6 rounded-full bg-navy-800 text-blue-300 flex items-center justify-center shrink-0 mt-0.5 text-[10px]">
                    <Bot className="w-3.5 h-3.5" />
                  </div>
                )}
                <div
                  className={`max-w-[85%] rounded-lg p-2.5 leading-relaxed whitespace-pre-wrap ${
                    msg.sender === 'user'
                      ? 'bg-blue-600 text-white rounded-tr-none'
                      : 'bg-white text-slate-800 border border-slate-200 rounded-tl-none shadow-xs'
                  }`}
                >
                  {msg.text}
                </div>
                {msg.sender === 'user' && (
                  <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center shrink-0 mt-0.5 text-[10px]">
                    <User className="w-3.5 h-3.5" />
                  </div>
                )}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Suggestion Chips */}
          <div className="px-3 py-2 bg-white border-t border-slate-100 flex flex-wrap gap-1.5 shrink-0">
            {SUGGESTION_CHIPS.map((chip, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleSendMessage(chip)}
                className="text-[11px] px-2.5 py-1 rounded-full bg-slate-100 hover:bg-blue-50 hover:text-blue-700 text-slate-700 border border-slate-200 transition-colors cursor-pointer text-left"
              >
                {chip}
              </button>
            ))}
          </div>

          {/* Input Footer */}
          <div className="p-2.5 bg-white border-t border-slate-200 flex items-center gap-1.5 shrink-0">
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about traceability, statuses, models..."
              className="flex-1 text-xs px-3 py-2 border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 bg-slate-50 placeholder:text-slate-400"
            />
            <Button
              size="sm"
              variant="primary"
              onClick={() => handleSendMessage()}
              disabled={!inputText.trim()}
              className="px-2.5 bg-navy-800 hover:bg-navy-900"
              aria-label="Send message"
            >
              <Send className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
