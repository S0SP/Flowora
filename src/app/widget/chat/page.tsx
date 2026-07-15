"use client";

import React, { useState, useEffect, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Send, Bot, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";

function ChatWidgetContent() {
  const searchParams = useSearchParams();
  const ws = searchParams.get("ws");

  const [config, setConfig] = useState<any>({
    title: "Live Chat",
    subtitle: "Ask us anything!",
    greeting: "Hi there! How can I help you today?",
    primaryColor: "#7c3aed",
    placeholder: "Type your message...",
    poweredBy: true,
  });

  const [threadId, setThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  
  const scrollRef = useRef<HTMLDivElement>(null);

  // 1. Fetch configuration & history
  useEffect(() => {
    if (!ws) return;

    // Fetch styling config
    fetch(`/api/widget/config?ws=${ws}`)
      .then(res => res.json())
      .then(data => {
        if (data.config) {
          setConfig({
            title: data.config.title || "Live Chat",
            subtitle: data.config.subtitle || "Ask us anything!",
            greeting: data.config.greeting || "Hi there! How can I help you today?",
            primaryColor: data.config.primaryColor || "#7c3aed",
            placeholder: data.config.placeholder || "Type your message...",
            poweredBy: data.config.poweredBy !== false,
          });
        }
      })
      .catch(console.error);

    // Fetch existing thread session from localStorage
    const savedThread = localStorage.getItem(`flowra_widget_thread_${ws}`);
    if (savedThread) {
      setThreadId(savedThread);
      fetch(`/api/widget/chat?threadId=${savedThread}`)
        .then(res => res.json())
        .then(data => {
          if (data.messages) {
            setMessages(data.messages);
          }
        })
        .catch(console.error)
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [ws]);

  // 2. Scroll to bottom on updates
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, sending]);

  // 3. Send message
  const handleSend = async () => {
    if (!input.trim() || !ws || sending) return;
    const currentInput = input;
    setInput("");
    setSending(true);

    // Optimistically add user message
    const tempUserMsg = {
      id: "temp-user",
      sender_type: "contact",
      content: currentInput,
      created_at: new Date().toISOString(),
    };
    setMessages(prev => [...prev, tempUserMsg]);

    try {
      const res = await fetch("/api/widget/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ws,
          message: currentInput,
          threadId: threadId || undefined,
        }),
      });

      const data = await res.json();
      if (data.threadId) {
        setThreadId(data.threadId);
        localStorage.setItem(`flowra_widget_thread_${ws}`, data.threadId);
      }

      if (data.reply) {
        const botMsg = {
          id: "temp-bot-" + Date.now(),
          sender_type: "bot",
          content: data.reply,
          created_at: new Date().toISOString(),
        };
        setMessages(prev => [...prev, botMsg]);
      }
    } catch (err) {
      console.error("Failed to send message:", err);
    } finally {
      setSending(false);
    }
  };

  if (!ws) {
    return (
      <div className="flex h-screen items-center justify-center bg-muted/20 text-muted-foreground text-sm">
        Missing Workspace ID
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-white select-none">
      {/* Header */}
      <div 
        className="flex items-center gap-3 p-4 text-white shadow-md shrink-0 transition-colors"
        style={{ backgroundColor: config.primaryColor }}
      >
        <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-white">
          <Bot className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-[14px] font-bold leading-tight truncate">{config.title}</h3>
          <p className="text-[11px] text-white/80 leading-none truncate">{config.subtitle}</p>
        </div>
      </div>

      {/* Messages area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#f8f9fa] scroll-smooth">
        {/* Default greeting message if no message history */}
        {messages.length === 0 && !loading && (
          <div className="flex items-start gap-2 max-w-[85%]">
            <div 
              className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-white"
              style={{ backgroundColor: config.primaryColor }}
            >
              <Bot className="w-3.5 h-3.5" />
            </div>
            <div className="bg-white border border-border p-3 rounded-2xl rounded-tl-none shadow-sm">
              <p className="text-[13px] text-foreground leading-relaxed whitespace-pre-wrap">
                {config.greeting}
              </p>
            </div>
          </div>
        )}

        {messages.map((msg, i) => {
          const isBot = msg.sender_type === "bot" || msg.sender_type === "agent";
          return (
            <div 
              key={msg.id || i} 
              className={cn(
                "flex items-start gap-2 max-w-[85%]",
                !isBot && "ml-auto flex-row-reverse"
              )}
            >
              {isBot && (
                <div 
                  className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-white"
                  style={{ backgroundColor: config.primaryColor }}
                >
                  <Bot className="w-3.5 h-3.5" />
                </div>
              )}
              <div 
                className={cn(
                  "p-3 rounded-2xl shadow-sm text-[13px] leading-relaxed whitespace-pre-wrap",
                  isBot 
                    ? "bg-white border border-border rounded-tl-none text-foreground" 
                    : "rounded-tr-none text-white font-medium"
                )}
                style={!isBot ? { backgroundColor: config.primaryColor } : undefined}
              >
                <p>{msg.content}</p>
              </div>
            </div>
          );
        })}

        {sending && (
          <div className="flex items-start gap-2 max-w-[85%]">
            <div 
              className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-white"
              style={{ backgroundColor: config.primaryColor }}
            >
              <Bot className="w-3.5 h-3.5" />
            </div>
            <div className="bg-white border border-border px-3 py-2 rounded-2xl rounded-tl-none shadow-sm flex gap-1 items-center">
              {[0, 1, 2].map(idx => (
                <div 
                  key={idx} 
                  className="w-1.5 h-1.5 rounded-full animate-bounce" 
                  style={{ 
                    backgroundColor: config.primaryColor,
                    animationDelay: `${idx * 150}ms` 
                  }} 
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Input controls */}
      <div className="p-3 border-t border-border bg-white flex flex-col shrink-0">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleSend()}
            placeholder={config.placeholder}
            className="flex-1 border border-border rounded-full h-10 px-4 text-[13px] focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
            style={{ "--tw-ring-color": config.primaryColor } as any}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || sending}
            className="w-10 h-10 rounded-full flex items-center justify-center text-white shrink-0 shadow-sm transition-opacity disabled:opacity-40"
            style={{ backgroundColor: config.primaryColor }}
          >
            <Send className="w-4 h-4" />
          </button>
        </div>

        {config.poweredBy && (
          <div className="flex items-center justify-center gap-1 mt-2 text-[10px] text-muted-foreground">
            <span>Powered by</span>
            <span className="font-bold text-foreground flex items-center gap-0.5">
              <MessageSquare className="w-2.5 h-2.5" /> Flowra
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ChatWidgetPage() {
  return (
    <Suspense fallback={
      <div className="flex h-screen items-center justify-center bg-muted/20 text-muted-foreground text-sm">
        Loading Chat...
      </div>
    }>
      <ChatWidgetContent />
    </Suspense>
  );
}
