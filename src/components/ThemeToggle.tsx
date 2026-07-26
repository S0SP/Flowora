"use client"

import React, { useState, useEffect } from "react"
import { Moon, Sun } from "lucide-react"
import { motion } from "framer-motion"
import { cn } from "@/lib/utils"
import { useTheme } from "next-themes"

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme, systemTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  
  useEffect(() => setMounted(true), [])
  
  const currentTheme = theme === "system" ? systemTheme : theme
  const isDark = mounted ? currentTheme === "dark" : false

  const toggleDark = () => {
    setTheme(isDark ? "light" : "dark")
  }

  // Prevent hydration mismatch
  if (!mounted) {
    return (
      <div className={cn("w-[48px] h-[26px] bg-gray-100/60 dark:bg-zinc-800/80 border border-border/80 rounded-full", className)} />
    )
  }

  return (
    <button
      onClick={toggleDark}
      className={cn(
        "relative flex items-center justify-between w-[48px] h-[26px] bg-gray-100/60 dark:bg-zinc-800/80 border border-border/80 rounded-full p-1 cursor-pointer transition-all hover:bg-gray-100/80 focus:outline-none shrink-0",
        className
      )}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
    >
      {/* Animated Thumb */}
      <motion.div
        className="absolute top-[2px] left-[2px] w-[20px] h-[20px] bg-white dark:bg-zinc-950 border border-border/10 rounded-full shadow-sm z-10"
        animate={{ x: isDark ? 22 : 0 }}
        transition={{ type: "spring", stiffness: 350, damping: 22 }}
      />
      
      <Sun className={cn(
        "w-3 h-3 ml-0.5 transition-all duration-200 z-0",
        isDark ? "text-gray-500 opacity-50 scale-75" : "text-amber-500 opacity-100 scale-100"
      )} />
      
      <Moon className={cn(
        "w-3 h-3 mr-0.5 transition-all duration-200 z-0",
        isDark ? "text-primary opacity-100 scale-100" : "text-gray-500 opacity-50 scale-75"
      )} />
    </button>
  )
}
