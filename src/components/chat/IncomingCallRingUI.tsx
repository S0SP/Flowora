"use client"

import React, { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Phone, X, Mic, MicOff, PhoneOff, Loader2 } from "lucide-react"
import { toast } from "sonner"
import {
  LiveKitRoom,
  RoomAudioRenderer,
  ControlBar,
  useConnectionState,
  ConnectionState,
} from "@livekit/components-react"
import "@livekit/components-styles"

interface IncomingCallRingUIProps {
  roomName: string
  phone: string
  workspaceId: string
  onClose: () => void
}

export function IncomingCallRingUI({ roomName, phone, workspaceId, onClose }: IncomingCallRingUIProps) {
  const [status, setStatus] = useState<"ringing" | "connecting" | "connected">("ringing")
  const [token, setToken] = useState<string>("")
  const livekitUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL || ""

  // Play ringing sound effect
  useEffect(() => {
    if (status === "ringing") {
      const audio = new Audio("/ring.mp3") // Add a standard ring.mp3 to public folder
      audio.loop = true
      audio.play().catch(e => console.log("Audio auto-play blocked", e))
      return () => {
        audio.pause()
        audio.currentTime = 0
      }
    }
  }, [status])

  const handleAccept = async () => {
    try {
      setStatus("connecting")
      
      // 1. Get LiveKit Token for human agent
      const res = await fetch("/api/voice/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomName,
          identity: `human-${Math.floor(Math.random() * 10000)}`,
          name: "Support Agent"
        })
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      
      setToken(data.token)
      setStatus("connected")
      
      // 2. Kick the AI Agent from the room so they don't talk over each other
      await fetch("/api/voice/kick-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomName })
      })

      toast.success("Connected to caller. AI Agent disconnected.")
      
    } catch (err: any) {
      toast.error(err.message || "Failed to connect to call")
      setStatus("ringing")
    }
  }

  const handleReject = () => {
    // If rejected, we might just let the AI handle it, or we could disconnect the call.
    // For now, we just close the UI and leave the AI in charge.
    onClose()
  }

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          className="bg-card w-full max-w-md rounded-2xl shadow-2xl border overflow-hidden relative"
        >
          {/* Header */}
          <div className="p-6 text-center space-y-4">
            <div className="mx-auto w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center relative">
              {status === "ringing" && (
                <>
                  <div className="absolute inset-0 bg-primary/20 rounded-full animate-ping" />
                  <div className="absolute inset-[-10px] bg-primary/10 rounded-full animate-ping" style={{ animationDelay: '0.2s' }} />
                </>
              )}
              <Phone className={cn("w-10 h-10 text-primary", status === "connected" && "animate-pulse")} />
            </div>
            
            <div>
              <h2 className="text-2xl font-bold">Transfer Request</h2>
              <p className="text-muted-foreground text-lg mt-1">{phone}</p>
              <p className="text-sm text-primary/80 mt-2 font-medium">
                {status === "ringing" && "AI is transferring this call..."}
                {status === "connecting" && "Connecting audio bridge..."}
                {status === "connected" && "Live Call Active"}
              </p>
            </div>
          </div>

          {/* Action Buttons (Only when ringing) */}
          {status === "ringing" && (
            <div className="flex justify-center gap-6 p-6 bg-muted/50">
              <button
                className="flex items-center justify-center w-16 h-16 rounded-full bg-red-600 hover:bg-red-700 text-white shadow-lg transition-colors"
                onClick={handleReject}
              >
                <X className="w-8 h-8" />
              </button>
              <button
                className="flex items-center justify-center w-16 h-16 rounded-full bg-green-500 hover:bg-green-600 text-white shadow-lg transition-colors"
                onClick={handleAccept}
              >
                <Phone className="w-8 h-8" />
              </button>
            </div>
          )}
          
          {status === "connecting" && (
            <div className="flex justify-center p-8 bg-muted/50">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          )}

          {/* LiveKit Room (when connected) */}
          {status === "connected" && token && livekitUrl && (
            <div className="p-6 bg-muted/30">
              <LiveKitRoom
                video={false}
                audio={true}
                token={token}
                serverUrl={livekitUrl}
                connect={true}
                onDisconnected={onClose}
              >
                <RoomAudioRenderer />
                <div className="flex flex-col items-center justify-center space-y-4">
                   <ControlBar variation="minimal" controls={{ camera: false, screenShare: false }} />
                   <button
                     className="w-full py-2 px-4 rounded-lg bg-red-600 hover:bg-red-700 text-white font-medium transition-colors"
                     onClick={onClose}
                   >
                     End Call
                   </button>
                </div>
                <ConnectionStateMonitor />
              </LiveKitRoom>
            </div>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  )
}

function ConnectionStateMonitor() {
  const state = useConnectionState();
  if (state === "disconnected") {
    toast("Call Disconnected")
  }
  return null;
}

// Utility class helper
function cn(...classes: (string | undefined | null | false)[]) {
  return classes.filter(Boolean).join(" ");
}
