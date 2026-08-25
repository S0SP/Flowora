'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import FeatureMatrix from '@/components/billing/FeatureMatrix';

export default function BillingPage() {
  const router = useRouter();
  const [isAnnual, setIsAnnual] = useState(true);

  const handleSelectPlan = (planId: string) => {
    router.push(`/checkout?plan=${planId}&billing=${isAnnual ? 'annual' : 'monthly'}`);
  };

  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground p-8 pb-20">
      <div className="max-w-6xl mx-auto w-full">
        
        <div className="text-center mb-12 mt-8">
          <h1 className="text-4xl md:text-5xl font-extrabold text-foreground mb-4">
            Unlimited Potential. One Plan.
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Simple, transparent pricing built to scale your business.
          </p>
          
          <div className="flex items-center justify-center mt-10 space-x-4">
            <label htmlFor="billing-toggle" className={`text-lg cursor-pointer ${!isAnnual ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>
              Monthly
            </label>
            <input 
              type="checkbox"
              id="billing-toggle" 
              checked={isAnnual} 
              onChange={(e) => setIsAnnual(e.target.checked)} 
              className="w-10 h-5 bg-muted rounded-full appearance-none checked:bg-emerald-500 transition-colors cursor-pointer relative after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:w-4 after:h-4 after:rounded-full after:transition-transform checked:after:translate-x-5"
            />
            <label htmlFor="billing-toggle" className={`text-lg cursor-pointer flex items-center ${isAnnual ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>
              Annually
              <span className="ml-2 inline-block px-2 py-1 text-xs font-bold text-emerald-500 bg-emerald-500/20 rounded-full">
                Save 20%
              </span>
            </label>
          </div>
        </div>

        <FeatureMatrix onSelectPlan={handleSelectPlan} isAnnual={isAnnual} />

      </div>
    </div>
  );
}
