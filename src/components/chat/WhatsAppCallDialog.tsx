"use client";

import React, { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Phone, PhoneOff, Mic, MicOff, Video, VideoOff, Loader2 } from "lucide-react";
import { cn, getInitials } from "@/lib/utils";
import { Contact } from "@/types";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";

interface WhatsAppCallDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contact: Contact;
  callType: "audio" | "video";
}

export function WhatsAppCallDialog({
  open,
  onOpenChange,
  contact,
  callType,
}: WhatsAppCallDialogProps) {
  const [callStatus, setCallStatus] = useState<"connecting" | "ringing" | "connected" | "ended">("connecting");
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(callType === "audio");
  const [callId, setCallId] = useState<string | null>(null);
  const channelRef = useRef<any>(null);

  useEffect(() => {
    if (open) {
      setCallStatus("connecting");
      setDuration(0);
      setIsMuted(false);
      setIsVideoOff(callType === "audio");
      initiateCall();
    } else {
      setCallId(null);
      channelRef.current?.unsubscribe();
      channelRef.current = null;
    }
  }, [open]);

  // Realtime subscription for call status
  useEffect(() => {
    if (!callId) return;

    const supabase = createClient();
    const channel = supabase
      .channel(`whatsapp-call-${callId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "whatsapp_calls", filter: `id=eq.${callId}` },
        (payload) => {
          const status = payload.new?.status;
          if (status === "ringing") {
            setCallStatus("ringing");
          } else if (status === "connected") {
            setCallStatus("connected");
          } else if (status === "terminated" || status === "failed" || status === "missed") {
            setCallStatus("ended");
            setTimeout(() => onOpenChange(false), 2000);
          }
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      channel.unsubscribe();
      if (channelRef.current === channel) {
        channelRef.current = null;
      }
    };
  }, [callId]);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (callStatus === "connected") {
      timer = setInterval(() => setDuration((prev) => prev + 1), 1000);
    }
    return () => clearInterval(timer);
  }, [callStatus]);

  const initiateCall = async () => {
    try {
      const res = await fetch("/api/whatsapp/calls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactId: contact.id,
          phone: contact.phone,
          type: callType,
        }),
      });
      
      if (!res.ok) throw new Error("Failed to initiate call");
      
      const data = await res.json();
      setCallId(data.call_id);
      
    } catch (err) {
      toast.error("Failed to start WhatsApp call");
      setCallStatus("ended");
      setTimeout(() => onOpenChange(false), 2000);
    }
  };

  const endCall = async () => {
    setCallStatus("ended");
    if (callId) {
      try {
        await fetch(`/api/whatsapp/calls/${callId}`, { method: "DELETE" });
      } catch (err) {
        console.error("Failed to end call properly", err);
      }
    }
    setTimeout(() => onOpenChange(false), 1000);
  };

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md p-0 overflow-hidden bg-zinc-950 text-white border-zinc-800">
        <div className="relative h-[600px] w-full flex flex-col items-center justify-between p-6">
          {/* Background blurred element */}
          <div className="absolute inset-0 bg-gradient-to-b from-teal-900/40 to-zinc-950/80 -z-10" />

          {/* Header info */}
          <div className="w-full flex flex-col items-center mt-8 space-y-4">
            <div className="w-24 h-24 rounded-full bg-teal-500/20 flex items-center justify-center border-4 border-zinc-900/50 shadow-2xl overflow-hidden">
              <span className="text-3xl font-semibold text-teal-400">
                {getInitials(contact.name, contact.phone)}
              </span>
            </div>
            
            <div className="text-center space-y-1">
              <h2 className="text-2xl font-medium tracking-tight">
                {contact.name || contact.phone}
              </h2>
              <p className="text-zinc-400 font-medium">
                {callStatus === "connecting" && "WhatsApp Call..."}
                {callStatus === "ringing" && "Ringing..."}
                {callStatus === "connected" && formatDuration(duration)}
                {callStatus === "ended" && "Call Ended"}
              </p>
            </div>
          </div>

          {/* Controls */}
          <div className="w-full max-w-[280px] grid grid-cols-3 gap-6 mb-8 transition-opacity duration-300">
            <button
              onClick={() => setIsMuted(!isMuted)}
              className={cn(
                "flex flex-col items-center gap-2",
                isMuted ? "text-zinc-400" : "text-white"
              )}
            >
              <div className={cn(
                "w-14 h-14 rounded-full flex items-center justify-center transition-colors",
                isMuted ? "bg-zinc-800" : "bg-zinc-800/60 hover:bg-zinc-700"
              )}>
                {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
              </div>
            </button>

            <button
              onClick={() => setIsVideoOff(!isVideoOff)}
              className={cn(
                "flex flex-col items-center gap-2",
                isVideoOff ? "text-zinc-400" : "text-white"
              )}
            >
              <div className={cn(
                "w-14 h-14 rounded-full flex items-center justify-center transition-colors",
                isVideoOff ? "bg-zinc-800" : "bg-zinc-800/60 hover:bg-zinc-700"
              )}>
                {isVideoOff ? <VideoOff className="w-6 h-6" /> : <Video className="w-6 h-6" />}
              </div>
            </button>

            <button
              onClick={endCall}
              className="flex flex-col items-center gap-2 text-white"
            >
              <div className="w-14 h-14 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center transition-colors shadow-lg shadow-red-500/20">
                <PhoneOff className="w-6 h-6" />
              </div>
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
