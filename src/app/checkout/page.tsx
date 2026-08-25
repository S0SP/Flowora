'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Check, Lock } from 'lucide-react';
import { Button } from '@/components/atoms/Button';
import { Input } from '@/components/atoms/Input';
import { loadRazorpay } from '@/lib/razorpay';
import { toast } from 'sonner';

function CheckoutContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const planId = searchParams.get('plan') || 'pro';
  const isAnnual = searchParams.get('billing') === 'annual';

  const [hasVoiceAddon, setHasVoiceAddon] = useState(false);
  const [aiCreditsAddonCount, setAiCreditsAddonCount] = useState(0);
  
  const [companyName, setCompanyName] = useState('');
  const [billingAddress, setBillingAddress] = useState('');
  const [gstNumber, setGstNumber] = useState('');
  const [couponCode, setCouponCode] = useState('');
  const [discountPercent, setDiscountPercent] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);

  // Hardcoded prices for demonstration, should ideally come from an API or shared constant
  const planPrices: Record<string, { name: string; monthly: number; annual: number }> = {
    starter: { name: 'Starter', monthly: 2000, annual: 19200 },
    pro: { name: 'Pro', monthly: 3000, annual: 28800 },
    premium: { name: 'Premium', monthly: 4000, annual: 38400 }
  };

  const currentPlan = planPrices[planId] || planPrices['pro'];
  const basePrice = isAnnual ? currentPlan.annual : currentPlan.monthly;
  const voiceAddonPrice = hasVoiceAddon ? (isAnnual ? 1500 * 12 : 1500) : 0;
  const aiCreditPrice = aiCreditsAddonCount * 500;
  
  const subtotal = basePrice + voiceAddonPrice + aiCreditPrice;
  const discountAmount = discountPercent > 0 ? (subtotal * discountPercent) / 100 : 0;
  const total = subtotal - discountAmount;

  const handleApplyCoupon = async () => {
    if (!couponCode.trim()) {
      toast.error('Please enter a coupon code');
      return;
    }
    try {
      const engineUrl = process.env.NEXT_PUBLIC_ENGINE_URL;
      if (!engineUrl) {
        // Fallback for dev without engine
        if (couponCode.toUpperCase() === 'FOUNDER20') {
          setDiscountPercent(20);
          toast.success('Coupon applied successfully');
        } else {
          toast.error('Invalid coupon code');
        }
        return;
      }
      const res = await fetch(`${engineUrl}/api/execute/billing/coupons/validate/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: couponCode })
      });
      const data = await res.json();
      if (data.valid) {
        setDiscountPercent(data.discount_percent || 0);
        toast.success('Coupon applied successfully');
      } else {
        setDiscountPercent(0);
        toast.error(data.error || 'Invalid coupon code');
      }
    } catch (err) {
      toast.error('Failed to validate coupon');
    }
  };

  const handleCheckout = async () => {
    if (!companyName || !billingAddress) {
      toast.error('Please fill in required billing details.');
      return;
    }

    setIsProcessing(true);
    try {
      const checkoutData = {
        planId,
        isAnnual,
        hasVoiceAddon,
        aiCreditsAddonCount,
        companyName,
        billingAddress,
        gstNumber,
        couponCode,
        total
      };

      const engineUrl = process.env.NEXT_PUBLIC_ENGINE_URL || 'http://localhost:8000';
      const res = await fetch(`${engineUrl}/api/execute/billing/checkout/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(checkoutData)
      });
      
      const data = await res.json();
      
      if (!data.order_id) {
        toast.error('Failed to create order');
        setIsProcessing(false);
        return;
      }

      const Razorpay = await loadRazorpay();
      if (!Razorpay) {
        toast.error('Razorpay SDK failed to load');
        setIsProcessing(false);
        return;
      }

      const razorpayKeyId = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
      if (!razorpayKeyId) {
        toast.error('Payment not configured. Contact support.');
        setIsProcessing(false);
        return;
      }

      const options = {
        key: razorpayKeyId,
        amount: total * 100, // paise
        currency: 'INR',
        name: 'Flowra',
        description: `Upgrade to ${currentPlan.name} plan`,
        order_id: data.order_id,
        handler: async function (response: any) {
          toast.success('Payment successful! Your workspace is being provisioned.');
          router.push('/dashboard/billing');
        },
        prefill: {
          name: companyName,
        },
        theme: {
          color: '#10B981' // brand primary
        }
      };

      const rzp = new Razorpay(options);
      rzp.on('payment.failed', function (response: any) {
        toast.error(`Payment Failed: ${response.error.description}`);
        setIsProcessing(false);
      });
      rzp.open();

    } catch (e) {
      console.error(e);
      toast.error('An error occurred during checkout');
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col md:flex-row">
      {/* Left Panel: Summary */}
      <div className="w-full md:w-[45%] bg-card border-r border-border p-8 md:p-12 lg:p-16 flex flex-col justify-between">
        <div>
          <button 
            onClick={() => router.back()} 
            className="flex items-center text-sm font-medium text-muted-foreground hover:text-foreground transition-colors mb-12"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to plans
          </button>
          
          <h1 className="text-3xl font-extrabold text-foreground mb-8">Review Your Workspace</h1>
          
          <div className="space-y-6">
            <div className="flex justify-between items-baseline pb-6 border-b border-border/50">
              <div>
                <div className="text-xl font-bold">{currentPlan.name} Plan</div>
                <div className="text-sm font-medium text-muted-foreground">{isAnnual ? 'Billed annually' : 'Billed monthly'}</div>
              </div>
              <div className="text-2xl font-bold tabular-nums">₹{basePrice.toLocaleString()}</div>
            </div>

            {planId === 'starter' && (
              <div className="flex justify-between items-center py-2">
                <div className="flex items-center space-x-3">
                  <input 
                    type="checkbox" 
                    id="voice-addon" 
                    className="w-4 h-4 bg-transparent border-border rounded text-primary focus:ring-primary"
                    checked={hasVoiceAddon}
                    onChange={(e) => setHasVoiceAddon(e.target.checked)}
                  />
                  <div>
                    <label htmlFor="voice-addon" className="text-sm font-bold text-foreground cursor-pointer">Voice Agent Access</label>
                    <p className="text-xs text-muted-foreground">Unlock voice capabilities in workflows</p>
                  </div>
                </div>
                <div className="text-sm font-bold tabular-nums">
                  +₹{isAnnual ? (1500*12).toLocaleString() : '1,500'}
                </div>
              </div>
            )}

            <div className="flex justify-between items-center py-2">
              <div>
                <div className="text-sm font-bold text-foreground">AI Intelligence Pack</div>
                <div className="text-xs text-muted-foreground">Extra AI Credits (₹500 per 1,000)</div>
              </div>
              <div className="flex items-center space-x-3 bg-secondary rounded-full px-2 py-1">
                <button 
                  onClick={() => setAiCreditsAddonCount(Math.max(0, aiCreditsAddonCount - 1))}
                  className="w-6 h-6 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                >
                  -
                </button>
                <span className="w-4 text-center text-sm font-bold tabular-nums">{aiCreditsAddonCount}</span>
                <button 
                  onClick={() => setAiCreditsAddonCount(aiCreditsAddonCount + 1)}
                  className="w-6 h-6 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                >
                  +
                </button>
              </div>
            </div>

            <div className="pt-6 border-t border-border/50">
              <div className="flex justify-between items-center mb-3">
                <span className="text-sm font-medium text-muted-foreground">Subtotal</span>
                <span className="text-sm font-bold tabular-nums">₹{subtotal.toLocaleString()}</span>
              </div>
              
              {discountAmount > 0 && (
                <div className="flex justify-between items-center mb-3">
                  <span className="text-sm font-medium text-primary">Discount</span>
                  <span className="text-sm font-bold tabular-nums text-primary">-₹{discountAmount.toLocaleString()}</span>
                </div>
              )}
              
              <div className="flex justify-between items-baseline mt-6">
                <span className="text-lg font-bold text-foreground">Total Due</span>
                <span className="text-3xl font-extrabold tabular-nums">₹{total.toLocaleString()}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-12 p-4 bg-secondary/50 rounded-lg border border-border/50 flex items-start space-x-3">
          <Lock className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
          <div>
            <div className="text-sm font-bold text-foreground">Secure & Encrypted</div>
            <div className="text-xs text-muted-foreground mt-1">Your payment information is securely processed by Razorpay. We do not store your full card details.</div>
          </div>
        </div>
      </div>

      {/* Right Panel: Billing Form */}
      <div className="w-full md:w-[55%] p-8 md:p-12 lg:p-16 flex flex-col justify-center">
        <div className="max-w-md w-full mx-auto">
          <h2 className="text-2xl font-bold text-foreground mb-8">Billing Details</h2>
          
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-bold text-muted-foreground mb-1">Company Name</label>
                <Input 
                  value={companyName} 
                  onChange={(e) => setCompanyName(e.target.value)} 
                  placeholder="Acme Corp"
                  className="bg-secondary/50 border-border/50 focus:border-primary text-foreground"
                />
                {!companyName && <p className="text-xs text-destructive mt-1">Required</p>}
              </div>
              <div>
                <label className="block text-sm font-bold text-muted-foreground mb-1">GST Number</label>
                <Input 
                  value={gstNumber} 
                  onChange={(e) => setGstNumber(e.target.value)} 
                  placeholder="Optional"
                  className="bg-secondary/50 border-border/50 focus:border-primary text-foreground"
                />
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-bold text-muted-foreground mb-1">Billing Address</label>
              <Input 
                value={billingAddress} 
                onChange={(e) => setBillingAddress(e.target.value)} 
                placeholder="123 Startup Ave, Tech Hub"
                className="bg-secondary/50 border-border/50 focus:border-primary text-foreground"
              />
              {!billingAddress && <p className="text-xs text-destructive mt-1">Required</p>}
            </div>

            <div className="pt-6 border-t border-border/50">
              <label className="block text-sm font-bold text-muted-foreground mb-1">Promo Code</label>
              <div className="flex space-x-2">
                <Input 
                  value={couponCode} 
                  onChange={(e) => setCouponCode(e.target.value)} 
                  placeholder="FOUNDER20"
                  className="bg-secondary/50 border-border/50 focus:border-primary text-foreground"
                />
                <Button variant="secondary" onClick={handleApplyCoupon} className="font-bold">Apply</Button>
              </div>
            </div>

            <div className="pt-8">
              <Button 
                onClick={handleCheckout} 
                disabled={!companyName || !billingAddress || isProcessing}
                className="w-full h-14 text-lg font-bold bg-foreground text-background hover:bg-foreground/90 transition-all"
              >
                {isProcessing ? 'Processing...' : 'Activate Premium Plan'}
              </Button>
              
              <div className="text-center mt-4">
                <p className="text-xs font-medium text-muted-foreground">Cancel anytime. Secure checkout.</p>
                {planId === 'premium' && (
                  <p className="text-xs font-bold text-primary mt-1">Includes 1,000 AI Credits and Dedicated Onboarding</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CheckoutPage() {
  return (
    <Suspense fallback={<div className="flex h-screen items-center justify-center bg-background text-foreground">Loading checkout...</div>}>
      <CheckoutContent />
    </Suspense>
  );
}
