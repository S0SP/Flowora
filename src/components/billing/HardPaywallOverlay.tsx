'use client';

import React, { useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Button } from '@/components/atoms/Button';
import { Zap, X, Check } from 'lucide-react';

interface HardPaywallOverlayProps {
  children: React.ReactNode;
}

const getContextualContent = (pathname: string) => {
  if (pathname.includes('/leads')) {
    return {
      title: 'Unlock Advanced Leads CRM',
      subtitle: 'Scale your pipeline with automated routing and unlimited contacts.',
      features: [
        'Unlimited Custom Fields & Tags',
        'Automated Lead Routing',
        'Custom Sales Pipeline Views'
      ]
    };
  }
  if (pathname.includes('/voice')) {
    return {
      title: 'Unlock the AI Voice Agent',
      subtitle: 'Instantly handle support calls and scale your team with 24/7 AI voice.',
      features: [
        'Inbound & Outbound Calling',
        'Human-like Latency (<500ms)',
        'Seamless CRM Syncing'
      ]
    };
  }
  if (pathname.includes('/campaigns')) {
    return {
      title: 'Unlock Broadcast Campaigns',
      subtitle: 'Reach your entire audience instantly with WhatsApp broadcasting.',
      features: [
        'Unlimited Campaign Blasts',
        'Advanced Analytics & Retries',
        'Dynamic Personalization'
      ]
    };
  }
  if (pathname.includes('/workflows')) {
    return {
      title: 'Unlock Unlimited Workflows',
      subtitle: 'Build intricate chatbots and API-driven sequences visually.',
      features: [
        'Unlimited Active Nodes',
        'Third-party API Webhooks',
        'Conditional Branching'
      ]
    };
  }
  
  // Default
  return {
    title: 'Unlock Flowra Pro',
    subtitle: 'Scale your business with advanced CRM, Automation, and Intelligence.',
    features: [
      'Unlimited Workflow Builder',
      'Advanced Leads CRM',
      'AI Chatbot Access'
    ]
  };
};

export function HardPaywallOverlay({ children }: HardPaywallOverlayProps) {
  const pathname = usePathname();
  const router = useRouter();
  
  // For demonstration, we assume free user. In production, fetch from context or API
  const [isFreeUser, setIsFreeUser] = useState(true);

  // Allowed routes for a free user
  const isAllowedRoute = 
    pathname === '/dashboard' || 
    pathname?.startsWith('/dashboard/billing') ||
    pathname?.startsWith('/dashboard/settings');

  if (isAllowedRoute || !isFreeUser) {
    return <>{children}</>;
  }

  const content = getContextualContent(pathname || '');

  return (
    <div className="relative w-full h-full overflow-hidden">
      {/* Blurred background showing the restricted page */}
      <div className="absolute inset-0 filter blur-md pointer-events-none opacity-40">
        {children}
      </div>
      
      {/* Hard Paywall Dialog */}
      <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
        
        {/* Premium Modal Container */}
        <div className="relative bg-gradient-to-b from-[#111111] to-[#0A0A0A] border border-[rgba(255,255,255,0.1)] rounded-2xl shadow-2xl p-8 max-w-[420px] w-full text-center flex flex-col items-center">
          
          <button 
            onClick={() => router.push('/dashboard')}
            className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Glowing Icon Container */}
          <div className="relative w-16 h-16 rounded-full flex items-center justify-center mb-6" style={{ boxShadow: '0 0 30px rgba(16, 185, 129, 0.25)' }}>
            <div className="absolute inset-0 bg-emerald-500/20 blur-xl rounded-full"></div>
            <div className="relative w-full h-full bg-emerald-500/10 border border-emerald-500/20 rounded-full flex items-center justify-center">
              <Zap className="w-8 h-8 text-emerald-500" />
            </div>
          </div>
          
          <h2 className="text-2xl font-extrabold text-white mb-2">
            {content.title}
          </h2>
          
          <p className="text-sm font-medium text-gray-400 mb-8">
            {content.subtitle}
          </p>
          
          <div className="w-full bg-black/40 rounded-xl p-5 border border-white/5 text-left mb-8 space-y-3">
            {content.features.map((feature, idx) => (
              <div key={idx} className="flex items-start space-x-3">
                <Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                <span className="text-sm font-medium text-gray-200">{feature}</span>
              </div>
            ))}
          </div>

          <Button 
            className="w-full text-base h-12 font-bold bg-white text-black hover:bg-white/90 transition-colors"
            onClick={() => router.push('/dashboard/billing')}
          >
            Upgrade to Pro
          </Button>
          
        </div>
      </div>
    </div>
  );
}
