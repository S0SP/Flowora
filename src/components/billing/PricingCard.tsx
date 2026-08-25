import React from 'react';
import { Check, X } from 'lucide-react';
import { Button } from '@/components/atoms/Button';

export interface PlanFeature {
  name: string;
  included: boolean;
}

export interface PlanData {
  id: string;
  name: string;
  monthlyPrice: number;
  annualPrice: number; // 20% discounted price * 12
  features: PlanFeature[];
  popular?: boolean;
}

interface PricingCardProps {
  plan: PlanData;
  isAnnual: boolean;
  onSelect: (plan: PlanData) => void;
}

export default function PricingCard({ plan, isAnnual, onSelect }: PricingCardProps) {
  const price = isAnnual ? Math.round(plan.annualPrice / 12) : plan.monthlyPrice;
  const originalPrice = isAnnual ? plan.monthlyPrice : null;
  const yearlyTotal = isAnnual ? plan.annualPrice : plan.monthlyPrice * 12;
  const yearlySavings = isAnnual ? (plan.monthlyPrice * 12) - plan.annualPrice : 0;

  return (
    <div className={`relative flex flex-col p-6 bg-card text-card-foreground border ${plan.popular ? 'border-primary' : 'border-border'} rounded-2xl shadow-xl transition-all hover:border-primary/50`}>
      {plan.popular && (
        <div className="absolute -top-4 left-0 right-0 flex justify-center">
          <span className="px-3 py-1 text-xs font-semibold tracking-wider text-white uppercase bg-primary rounded-full">
            Most Popular
          </span>
        </div>
      )}
      <div className="mb-6">
        <h3 className="text-2xl font-bold">{plan.name}</h3>
        <div className="mt-4 flex items-baseline">
          <span className="text-4xl font-extrabold tracking-tight">₹{price.toLocaleString()}</span>
          <span className="ml-1 text-xl font-medium text-muted-foreground">/mo</span>
        </div>
        {isAnnual && (
          <div className="mt-2 text-sm text-muted-foreground">
            <span className="line-through">₹{(plan.monthlyPrice * 12).toLocaleString()}</span>
            <span className="ml-2 text-primary font-medium">Save ₹{yearlySavings.toLocaleString()}</span>
            <div className="mt-1">Billed ₹{yearlyTotal.toLocaleString()} yearly</div>
          </div>
        )}
      </div>
      
      <ul className="flex-1 space-y-4 text-sm text-muted-foreground">
        {plan.features.map((feature, idx) => (
          <li key={idx} className={`flex items-start ${!feature.included ? 'opacity-50' : ''}`}>
            {feature.included ? (
              <Check className="w-5 h-5 mr-3 text-primary shrink-0" />
            ) : (
              <X className="w-5 h-5 mr-3 shrink-0" />
            )}
            <span className={!feature.included ? 'line-through' : ''}>
              {feature.name}
            </span>
          </li>
        ))}
      </ul>
      
      <Button
        onClick={() => onSelect(plan)}
        variant={plan.popular ? "default" : "outline"}
        className="w-full mt-8"
      >
        Select {plan.name}
      </Button>
    </div>
  );
}
