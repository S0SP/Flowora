import React from 'react';
import { Check, Info } from 'lucide-react';
import { Button } from '@/components/atoms/Button';

const MATRIX_DATA = [
  {
    category: "Core CRM & Channels",
    items: [
      { name: "WhatsApp Channels", starter: "1 Number", pro: "1 Number", premium: "Multiple Numbers" },
      { name: "Free Conversations", starter: true, pro: true, premium: true },
      { name: "Contacts Limit", starter: "Unlimited", pro: "Unlimited", premium: "Unlimited" },
      { name: "Sales Pipelines", starter: "Basic", pro: "Advanced", premium: "Advanced" },
      { name: "Auto-assign Leads", starter: false, pro: true, premium: true },
      { name: "Custom Fields & Tags", starter: false, pro: true, premium: true },
    ]
  },
  {
    category: "AI & Automation",
    items: [
      { name: "AI Lead Qualification Agent", tooltip: "Qualifies inbound leads automatically.", starter: false, pro: true, premium: true },
      { name: "AI Sales Agent", tooltip: "Engages and sells to prospects 24/7.", starter: false, pro: false, premium: true },
      { name: "AI Customer Support Agent", tooltip: "Handles support tickets seamlessly.", starter: false, pro: false, premium: true },
      { name: "Automated Conversations", starter: false, pro: "Lead Qual Only", premium: "Full Access (24/7)" },
      { name: "Advanced Chatbot Flows", starter: "Basic", pro: "Advanced", premium: "Unlimited" },
      { name: "Campaign Auto-retries", starter: false, pro: true, premium: true },
    ]
  },
  {
    category: "Integrations & Scale",
    items: [
      { name: "Plug & Play Integrations", tooltip: "Salesforce, HubSpot, Shopify, Razorpay, etc.", starter: "Basic (5)", pro: "Advanced (20+)", premium: "All (60+)" },
      { name: "APIs & Webhooks", starter: false, pro: true, premium: true },
      { name: "WhatsApp Commerce", starter: false, pro: true, premium: true },
      { name: "Native Payments", starter: false, pro: true, premium: true },
    ]
  }
];

export default function FeatureMatrix({ onSelectPlan, isAnnual }: { onSelectPlan: (planId: string) => void, isAnnual: boolean }) {
  const renderValue = (value: any) => {
    if (value === true) return <Check className="w-4 h-4 text-emerald-500 mx-auto" />;
    if (value === false) return <span className="text-muted-foreground">—</span>;
    return <span className="text-foreground font-medium">{value}</span>;
  };

  return (
    <div className="mt-8 max-w-5xl mx-auto overflow-hidden">
      <div className="w-full text-sm">
        {/* Sticky Header Row */}
        <div className="sticky top-0 z-20 grid grid-cols-4 gap-4 bg-background/95 backdrop-blur-md border-b border-zinc-800 py-6">
          <div className="col-span-1 flex items-end pb-4 font-bold text-muted-foreground uppercase tracking-wider text-xs">
            Feature Capability
          </div>
          
          <div className="col-span-1 text-center flex flex-col items-center justify-end px-2">
            <div className="font-extrabold text-2xl text-foreground mb-1 tabular-nums">Starter</div>
            <div className="text-muted-foreground mb-4 tabular-nums font-medium">
              ₹{isAnnual ? '1,600' : '2,000'}/mo
            </div>
            <Button variant="outline" size="sm" className="w-full font-bold" onClick={() => onSelectPlan('starter')}>
              Select Starter
            </Button>
          </div>
          
          <div className="col-span-1 text-center flex flex-col items-center justify-end px-2 relative">
            <div className="absolute -top-4">
              <span className="px-3 py-1 text-[10px] font-bold tracking-widest text-white uppercase bg-emerald-500 rounded-full shadow-[0_0_15px_rgba(16,185,129,0.3)]">
                Popular
              </span>
            </div>
            <div className="font-extrabold text-2xl text-foreground mb-1 mt-2 tabular-nums">Pro</div>
            <div className="text-muted-foreground mb-4 tabular-nums font-medium">
              ₹{isAnnual ? '2,400' : '3,000'}/mo
            </div>
            <Button variant="default" size="sm" className="w-full font-bold bg-emerald-500 text-white hover:bg-emerald-600 transition-colors" onClick={() => onSelectPlan('pro')}>
              Select Pro
            </Button>
          </div>
          
          <div className="col-span-1 text-center flex flex-col items-center justify-end px-2">
            <div className="font-extrabold text-2xl text-foreground mb-1 tabular-nums">Premium</div>
            <div className="text-muted-foreground mb-4 tabular-nums font-medium">
              ₹{isAnnual ? '3,200' : '4,000'}/mo
            </div>
            <Button variant="outline" size="sm" className="w-full font-bold" onClick={() => onSelectPlan('premium')}>
              Select Premium
            </Button>
          </div>
        </div>

        {/* Matrix Body */}
        <div className="pt-8">
          {MATRIX_DATA.map((section, sIdx) => (
            <div key={sIdx} className="mb-12">
              <div className="grid grid-cols-4 gap-4 py-3 border-b border-zinc-800">
                <div className="col-span-4 font-bold text-foreground text-sm uppercase tracking-wider">
                  {section.category}
                </div>
              </div>
              
              {section.items.map((item, iIdx) => (
                <div 
                  key={iIdx} 
                  className="grid grid-cols-4 gap-4 py-3 border-b border-zinc-800 hover:bg-muted/30 transition-colors items-center"
                >
                  <div className="col-span-1 font-medium text-muted-foreground flex items-center pr-4 text-xs">
                    {item.name}
                    {item.tooltip && (
                      <div className="group relative ml-2 cursor-help flex items-center">
                        <Info className="w-3.5 h-3.5 text-muted-foreground/50 hover:text-muted-foreground transition-colors" />
                        <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 hidden group-hover:block w-48 p-2 bg-[#111] border border-white/10 rounded-md text-xs text-white shadow-2xl z-30 text-center pointer-events-none">
                          {item.tooltip}
                        </div>
                      </div>
                    )}
                  </div>
                  
                  <div className="col-span-1 text-center text-muted-foreground flex items-center justify-center text-xs">
                    {renderValue(item.starter)}
                  </div>
                  <div className="col-span-1 text-center text-muted-foreground flex items-center justify-center text-xs">
                    {renderValue(item.pro)}
                  </div>
                  <div className="col-span-1 text-center text-muted-foreground flex items-center justify-center text-xs">
                    {renderValue(item.premium)}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
