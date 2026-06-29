"use client";

import { useState, useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { 
  Bot, 
  Settings2, 
  Play, 
  Pause, 
  Loader2, 
  HelpCircle, 
  Send, 
  User as UserIcon, 
  MessageSquare,
  Sparkles,
  RefreshCw,
  Info,
  History,
  Clock,
  ChevronDown,
  Calendar
} from "lucide-react";

const schema = z.object({
  is_enabled: z.boolean().default(false),
  system_prompt: z.string().min(1, "Instructions prompt is required"),
  gemini_api_key: z.string().optional().nullable(),
  is_caching_enabled: z.boolean().default(false),
  is_lead_tool_enabled: z.boolean().default(false),
  is_store_tool_enabled: z.boolean().default(false),
});

type FormData = z.infer<typeof schema>;

interface Message {
  id: string;
  sender: "user" | "bot";
  text: string;
  timestamp: string;
}

const SYSTEM_PROMPT_PRESETS = [
  {
    name: "Standard Customer Service",
    description: "Friendly support assistant, answers FAQs and books discovery calls.",
    prompt: "You are a helpful customer service AI assistant for our digital agency. Answer questions clearly, politely, and keep your responses under 2-3 sentences. Encourage the customer to schedule a discovery call to discuss further details."
  },
  {
    name: "Lead Qualification & Booking",
    description: "Qualifies leads by budget and timeline before booking.",
    prompt: "You are a sales qualification agent for our agency. Your goal is to qualify leads by politely asking: 1. Their project timeline (immediate, 1-3 months, just researching), and 2. General budget. Do not answer complex pricing questions directly; ask them to schedule a call. Keep responses short and conversational."
  },
  {
    name: "E-Commerce Support",
    description: "Handles orders, discounts, and product inquiries.",
    prompt: "You are a helpful retail e-commerce bot. Assist customers with sizing, shipping rates, and product inventory details. Provide a friendly 10% coupon code (WELCOME10) to complete their checkout if they seem interested. Keep responses conversational and concise."
  }
];

export default function ChatbotPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [simulatorLoading, setSimulatorLoading] = useState(false);
  const [promptHistory, setPromptHistory] = useState<{ id: string; prompt: string; created_at: string }[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  
  // Simulator state
  const [messages, setMessages] = useState<Message[]>([
    { id: "1", sender: "bot", text: "Hello! How can I help you today?", timestamp: "10:00 AM" }
  ]);
  const [inputText, setInputText] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);

  const { register, handleSubmit, watch, setValue, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      is_enabled: false,
      system_prompt: "",
      is_caching_enabled: false,
      is_lead_tool_enabled: false,
      is_store_tool_enabled: false,
    }
  });

  const isEnabled = watch("is_enabled");
  const systemPrompt = watch("system_prompt");
  const geminiApiKey = watch("gemini_api_key");

  // Load settings
  const fetchSettings = async () => {
    try {
      const res = await fetch("/api/chatbot");
      if (!res.ok) throw new Error("Failed to load settings");
      const { settings, history } = await res.json();
      if (settings) {
        reset({
          is_enabled: settings.is_enabled,
          system_prompt: settings.system_prompt,
          gemini_api_key: settings.gemini_api_key,
          is_caching_enabled: settings.is_caching_enabled || false,
          is_lead_tool_enabled: settings.is_lead_tool_enabled || false,
          is_store_tool_enabled: settings.is_store_tool_enabled || false,
        });
      }
      if (history) {
        setPromptHistory(history);
      }
    } catch (err) {
      toast.error("Failed to load chatbot configurations.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, simulatorLoading]);

  // Apply Preset
  const handleApplyPreset = (presetText: string) => {
    setValue("system_prompt", presetText);
    toast.success("System prompt preset applied!");
  };

  // Submit Settings Update
  const onSubmit = async (data: FormData) => {
    setSaving(true);
    try {
      const res = await fetch("/api/chatbot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Failed to save configuration");
      }

      toast.success(
        data.is_enabled 
          ? "WhatsApp AI Chatbot activated!" 
          : "Settings saved successfully."
      );
      
      fetchSettings();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  };

  // Run Simulator Send
  const handleSendSimulatorMsg = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || simulatorLoading) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      sender: "user",
      text: inputText.trim(),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputText("");
    setSimulatorLoading(true);

    try {
      const res = await fetch("/api/chatbot/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMsg.text,
          history: messages.slice(1), // Exclude the greeting greeting message
          prompt: systemPrompt,
          api_key: geminiApiKey,
          is_lead_tool_enabled: watch("is_lead_tool_enabled"),
          is_store_tool_enabled: watch("is_store_tool_enabled"),
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Simulator connection failed");

      const botMsg: Message = {
        id: (Date.now() + 1).toString(),
        sender: "bot",
        text: data.reply,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      setMessages((prev) => [...prev, botMsg]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Testing generated error");
      const errorMsg: Message = {
        id: Date.now().toString(),
        sender: "bot",
        text: "❌ Error: Could not generate response. Check your API Key configuration.",
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setSimulatorLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-lg font-semibold text-foreground">AI Chatbot Agent</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Train and deploy a smart conversation agent to automatically reply to inbound customer questions on WhatsApp.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Settings Panel (Col span 7) */}
        <div className="lg:col-span-7 space-y-6">
          <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-4 border-b border-border pb-3">
              <Settings2 className="w-5 h-5 text-primary" />
              <h3 className="font-semibold text-sm text-foreground">Chatbot Configuration</h3>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              
              {/* API Key */}
              <div className="space-y-1.5">
                <div className="flex justify-between">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Gemini API Key
                  </label>
                  <span className="text-[10px] text-muted-foreground font-normal">
                    Falls back to environment variable if left blank
                  </span>
                </div>
                <input
                  type="password"
                  {...register("gemini_api_key")}
                  placeholder="••••••••••••••••••••••••••••••••••••••"
                  className="w-full px-3 py-2.5 bg-background border border-input rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              {/* Presets List */}
              <div className="space-y-1.5">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                  Select Instructions Preset
                </span>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                  {SYSTEM_PROMPT_PRESETS.map((preset) => (
                    <button
                      key={preset.name}
                      type="button"
                      onClick={() => handleApplyPreset(preset.prompt)}
                      className="p-3 bg-muted/40 hover:bg-muted/70 text-left border border-border rounded-xl transition-all flex flex-col justify-between"
                    >
                      <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-primary" />
                        {preset.name}
                      </span>
                      <span className="text-[10px] text-muted-foreground mt-1 leading-normal">
                        {preset.description}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Instructions system prompt */}
              <div className="space-y-1.5 relative">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    System Instructions (Prompt)
                  </label>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setShowHistory(!showHistory)}
                      className="text-[10px] font-medium text-primary hover:text-primary/80 flex items-center gap-1.5 bg-primary/10 hover:bg-primary/20 px-2.5 py-1 rounded-lg transition-all"
                    >
                      <History className="w-3.5 h-3.5" />
                      History ({promptHistory.length})
                      <ChevronDown className="w-3 h-3" />
                    </button>
                    {showHistory && (
                      <div className="absolute right-0 mt-1.5 w-72 bg-card border border-border rounded-xl shadow-xl z-50 p-2.5 max-h-60 overflow-y-auto space-y-1.5">
                        <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider px-1 pb-1 border-b border-border/60">
                          Saved Versions History
                        </div>
                        {promptHistory.length === 0 ? (
                          <div className="text-xs text-muted-foreground text-center py-4">
                            No past versions logged yet
                          </div>
                        ) : (
                          promptHistory.map((h, idx) => (
                            <button
                              key={h.id}
                              type="button"
                              onClick={() => {
                                setValue("system_prompt", h.prompt);
                                setShowHistory(false);
                                toast.success(`Restored prompt version v${promptHistory.length - idx}`);
                              }}
                              className="w-full text-left p-2 hover:bg-muted rounded-lg border border-border/50 hover:border-border transition-all flex flex-col gap-1"
                            >
                              <div className="flex items-center gap-1.5 text-[9px] text-muted-foreground font-medium">
                                <Clock className="w-3 h-3" />
                                {new Date(h.created_at).toLocaleDateString()} {new Date(h.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </div>
                              <div className="text-[11px] text-foreground font-sans line-clamp-2 leading-relaxed">
                                {h.prompt}
                              </div>
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <textarea
                  {...register("system_prompt")}
                  rows={6}
                  placeholder="Tell the AI who it is, how it should speak, and what guidelines it must follow..."
                  className="w-full px-3 py-2.5 bg-background border border-input rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-ring font-sans leading-relaxed"
                />
                {errors.system_prompt && (
                  <p className="text-xs text-destructive">{errors.system_prompt.message}</p>
                )}
              </div>

              {/* Active Toggle switch */}
              <div className="flex items-center justify-between p-3 bg-muted/40 border border-border rounded-xl">
                <div className="flex flex-col">
                  <span className="text-xs font-semibold text-foreground">Chatbot active status</span>
                  <span className="text-[10px] text-muted-foreground">Automatically respond to WhatsApp messages</span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    {...register("is_enabled")}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
                </label>
              </div>

              {/* Prompt Caching Toggle switch */}
              <div className="flex items-center justify-between p-3 bg-muted/40 border border-border rounded-xl">
                <div className="flex flex-col">
                  <span className="text-xs font-semibold text-foreground">Google Gemini Prompt Caching</span>
                  <span className="text-[10px] text-muted-foreground">Cache system prompts over 32k tokens to reduce billing by 50%</span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    {...register("is_caching_enabled")}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
                </label>
              </div>

              {/* Tool Calling Configuration section */}
              <div className="space-y-3 border-t border-border pt-4 mt-2">
                <div className="flex items-center gap-1.5 mb-1">
                  <Bot className="w-4 h-4 text-primary" />
                  <span className="text-xs font-bold text-foreground uppercase tracking-wider">
                    AI Agent Tool Calling (Function Access)
                  </span>
                </div>

                {/* Lead Status Checker Switch */}
                <div className="flex items-center justify-between p-3 bg-muted/40 border border-border rounded-xl">
                  <div className="flex flex-col">
                    <span className="text-xs font-semibold text-foreground">Lead Booking Checker Tool</span>
                    <span className="text-[10px] text-muted-foreground">Allows AI to query database sheets for customer demo status</span>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      {...register("is_lead_tool_enabled")}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
                  </label>
                </div>

                {/* Ebook Catalog Switch */}
                <div className="flex items-center justify-between p-3 bg-muted/40 border border-border rounded-xl">
                  <div className="flex flex-col">
                    <span className="text-xs font-semibold text-foreground">eBook Store Catalog Tool</span>
                    <span className="text-[10px] text-muted-foreground">Allows AI to retrieve product titles, prices, and buy links</span>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      {...register("is_store_tool_enabled")}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
                  </label>
                </div>
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={saving}
                className={`w-full py-2.5 rounded-xl font-medium text-sm flex items-center justify-center gap-2 transition-all ${
                  isEnabled 
                    ? "bg-primary hover:bg-primary/95 text-primary-foreground" 
                    : "bg-muted hover:bg-muted/80 text-foreground border border-border"
                }`}
              >
                {saving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : isEnabled ? (
                  <>
                    <Play className="w-4 h-4 fill-primary-foreground" />
                    Activate Chatbot Agent
                  </>
                ) : (
                  <>
                    <Pause className="w-4 h-4 fill-foreground" />
                    Save Draft Prompt
                  </>
                )}
              </button>

            </form>
          </div>

          {/* Help card */}
          <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-3 pb-2 border-b border-border/50">
              <HelpCircle className="w-4 h-4 text-muted-foreground" />
              <h4 className="font-semibold text-xs text-foreground uppercase tracking-wider">How to train your bot</h4>
            </div>
            <ol className="text-xs text-muted-foreground list-decimal pl-4 space-y-2 leading-relaxed">
              <li>Define the **Identity & Tone**: Mention the agency name and state whether it should be friendly, casual, or formal.</li>
              <li>Provide **Clear Constraints**: Explicitly restrict the AI from discussing pricing or promising specific guarantees (e.g., *"If asked about custom pricing, reply that we need to audit their business first"*).</li>
              <li>Instruct it to **Capture Info**: Tell the AI to ask questions before offering booking links, qualifying your inbound queries.</li>
            </ol>
          </div>
        </div>

        {/* Sandbox WhatsApp Simulator (Col span 5) */}
        <div className="lg:col-span-5 h-full">
          <div className="bg-[#efeae2] border border-slate-300/80 rounded-2xl shadow-lg flex flex-col h-[580px] overflow-hidden relative">
            
            {/* Simulator Header */}
            <div className="bg-[#005e54] text-white px-4 py-3 flex items-center gap-3 shadow-md z-10 shrink-0">
              <div className="w-9 h-9 rounded-full bg-teal-600/50 flex items-center justify-center border border-white/10 shrink-0">
                <Bot className="w-5 h-5 text-white" />
              </div>
              <div className="min-w-0">
                <h4 className="text-xs font-semibold truncate leading-tight">WhatsApp AI Simulator</h4>
                <p className="text-[9px] text-teal-100/80 mt-0.5 leading-none">
                  {simulatorLoading ? "Typing..." : "Online Sandbox"}
                </p>
              </div>
            </div>

            {/* Simulator messages area */}
            <div className="flex-1 p-4 overflow-y-auto space-y-3 scrollbar-thin select-text">
              <div className="bg-teal-50/70 border border-teal-500/10 text-teal-800 rounded-xl p-2 text-[10px] text-center leading-normal mb-2 flex items-center gap-2 justify-center">
                <Info className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                <span>Test your prompts in real time. Simulator uses your API Key settings.</span>
              </div>

              {messages.map((m) => (
                <div
                  key={m.id}
                  className={`flex ${m.sender === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[80%] rounded-xl p-3 shadow-xs text-xs relative ${
                      m.sender === "user"
                        ? "bg-[#d9fdd3] text-slate-800 rounded-tr-none border border-[#c4ebd1]/40"
                        : "bg-white text-slate-800 rounded-tl-none border border-slate-200/50"
                    }`}
                  >
                    <p className="leading-relaxed whitespace-pre-wrap">{m.text}</p>
                    <span className="text-[8px] text-slate-400 block text-right mt-1 font-mono">
                      {m.timestamp}
                    </span>
                  </div>
                </div>
              ))}

              {simulatorLoading && (
                <div className="flex justify-start">
                  <div className="bg-white text-slate-800 rounded-xl rounded-tl-none p-3 shadow-xs border border-slate-200/50">
                    <div className="flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: "0ms" }}></span>
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: "150ms" }}></span>
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: "300ms" }}></span>
                    </div>
                  </div>
                </div>
              )}

              <div ref={chatEndRef} />
            </div>

            {/* Simulator Input footer */}
            <form onSubmit={handleSendSimulatorMsg} className="p-2 bg-[#f0f2f5] border-t border-slate-200/60 flex items-center gap-2 shrink-0 z-10">
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Type a test message..."
                disabled={simulatorLoading}
                className="flex-1 px-3 py-2 bg-white border border-slate-200 rounded-full text-xs focus:outline-none"
              />
              <button
                type="submit"
                disabled={!inputText.trim() || simulatorLoading}
                className={`w-8 h-8 flex items-center justify-center rounded-full text-white transition-all shrink-0 ${
                  inputText.trim() && !simulatorLoading ? "bg-[#00a884] hover:bg-[#008f72]" : "bg-slate-300"
                }`}
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </form>

          </div>
        </div>

      </div>

    </div>
  );
}
