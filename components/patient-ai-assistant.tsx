'use client';

import { FormEvent, useMemo, useState } from 'react';
import { Bot, Send, Sparkles, UserRound, Loader2, ShieldCheck, ArrowRight, X, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';

type Message = {
  role: 'user' | 'assistant';
  text: string;
  citations?: string[];
  actions?: string[];
  fallback?: boolean;
};

const starters = [
  'What is my next appointment?',
  'Summarize my recent care activity.',
  'Which documents are available in my record?',
  'What unresolved continuity items should I review?',
];

export function PatientAiAssistant({ compact = false }: { compact?: boolean }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  const history = useMemo(
    () => messages.slice(-8).map((message) => ({ role: message.role, text: message.text })),
    [messages],
  );

  async function send(event?: FormEvent, preset?: string) {
    event?.preventDefault();
    const message = (preset ?? input).trim();
    if (!message || loading) return;

    setInput('');
    setMessages((current) => [...current, { role: 'user', text: message }]);
    setLoading(true);

    try {
      const response = await fetch('/api/ai/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ message, history }),
      });

      const raw = await response.text();
      let data: any = {};
      if (raw.trim()) {
        try { data = JSON.parse(raw); } catch { data = { error: raw }; }
      }

      if (!response.ok) {
        throw new Error(data.error || `Assistant request failed (${response.status}).`);
      }

      setMessages((current) => [
        ...current,
        {
          role: 'assistant',
          text: data.answer || 'I could not find that in your record.',
          citations: data.cited_event_ids || [],
          actions: data.suggested_actions || [],
          fallback: Boolean(data.fallback),
        },
      ]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'CareMesh AI is temporarily unavailable.');
      setMessages((current) => current.slice(0, -1));
    } finally {
      setLoading(false);
    }
  }

  function resetChat() {
    setMessages([]);
    setInput('');
  }

  return (
    <section className={`assistant-shell panel ${compact ? 'assistant-compact' : ''}`}>
      <div className="assistant-head">
        <div className="assistant-title-wrap">
          <div className="assistant-avatar"><Sparkles size={17}/></div>
          <div>
            <div className="eyebrow">CAREMESH AI</div>
            <h2>Personal record assistant</h2>
            <p>Ask about your own appointments, documents, timeline and continuity items.</p>
          </div>
        </div>
        <div className="assistant-head-actions">
          <div className="assistant-trust"><ShieldCheck size={13}/><span>Private to your account</span></div>
          {messages.length > 0 ? <button className="icon-btn" onClick={resetChat} aria-label="Clear conversation" title="Clear conversation"><RotateCcw size={15}/></button> : null}
        </div>
      </div>

      <div className="assistant-safety"><ShieldCheck size={14}/><span>CareMesh AI organizes documented records. It does not diagnose, prescribe, or make treatment decisions.</span></div>

      <div className="assistant-body">
        {messages.length === 0 ? (
          <div className="assistant-empty">
            <div className="assistant-empty-icon"><Bot size={27}/></div>
            <div className="assistant-empty-eyebrow">YOUR PRIVATE RECORD ASSISTANT</div>
            <h3>How can I help?</h3>
            <p>Ask a question about your CareMesh record. Suggestions below are examples you can use instantly.</p>
            <div className="assistant-starters">
              {starters.map((starter) => (
                <button key={starter} onClick={() => send(undefined, starter)} disabled={loading}>
                  <span>{starter}</span><ArrowRight size={14}/>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="assistant-messages">
            {messages.map((message, index) => (
              <div key={`${message.role}-${index}`} className={`assistant-message ${message.role === 'user' ? 'assistant-message-user' : 'assistant-message-bot'}`}>
                <div className="assistant-message-icon">{message.role === 'user' ? <UserRound size={14}/> : <Bot size={14}/>}</div>
                <div className="assistant-message-card">
                  <p>{message.text}</p>
                  {message.fallback ? <div className="assistant-fallback-note">The assistant is temporarily unavailable. This response is based directly on your CareMesh record.</div> : null}
                  {message.citations?.length ? <div className="assistant-citations">Sources: {message.citations.join(', ')}</div> : null}
                  {message.actions?.length ? <div className="assistant-actions"><span>Useful next steps</span>{message.actions.map((action) => <div key={action}>• {action}</div>)}</div> : null}
                </div>
              </div>
            ))}
            {loading ? (
              <div className="assistant-message assistant-message-bot">
                <div className="assistant-message-icon"><Bot size={14}/></div>
                <div className="assistant-message-card assistant-thinking"><Loader2 size={15} className="spin"/><span>Checking your private CareMesh record…</span></div>
              </div>
            ) : null}
          </div>
        )}
      </div>

      <form className="assistant-composer" onSubmit={send}>
        <input value={input} onChange={(e)=>setInput(e.target.value)} placeholder="Ask about your timeline, appointment or documents…" maxLength={1200} aria-label="Ask CareMesh AI" />
        <button className="btn btn-primary" type="submit" disabled={!input.trim() || loading} aria-label="Send question">
          {loading ? <Loader2 size={15} className="spin"/> : <Send size={15}/>}<span className="composer-label">Send</span>
        </button>
      </form>
    </section>
  );
}

export function PatientAiLauncher() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="ai-fab" onClick={() => setOpen(true)} aria-label="Open CareMesh AI assistant"><Sparkles size={19}/><span>Ask AI</span></button>
      {open ? (
        <div className="ai-drawer-backdrop" onClick={() => setOpen(false)}>
          <aside className="ai-drawer" aria-label="CareMesh AI assistant" onClick={(event)=>event.stopPropagation()}>
            <div className="ai-drawer-head">
              <div><strong>CareMesh AI</strong><span>Private record assistant</span></div>
              <button type="button" className="icon-btn" onClick={()=>setOpen(false)} aria-label="Close AI assistant"><X size={18}/></button>
            </div>
            <PatientAiAssistant compact />
          </aside>
        </div>
      ) : null}
    </>
  );
}
