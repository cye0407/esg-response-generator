import { loadStripe, type Stripe } from '@stripe/stripe-js';
import { supabase, isSupabaseConfigured } from './supabase';

let stripePromise: Promise<Stripe | null> | null = null;

export function getStripe(): Promise<Stripe | null> {
  if (!stripePromise) {
    const key = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
    if (!key) {
      console.warn('Stripe publishable key not set');
      return Promise.resolve(null);
    }
    stripePromise = loadStripe(key);
  }
  return stripePromise;
}

export async function createCheckoutSession(sessionId: string): Promise<{ url: string } | { error: string }> {
  if (!isSupabaseConfigured()) return { error: 'Supabase not configured' };

  const { data, error } = await supabase.functions.invoke('create-checkout', {
    body: {
      sessionId,
      priceId: import.meta.env.VITE_PRICE_ID,
      successUrl: `${window.location.origin}?session=${sessionId}&payment=success`,
      cancelUrl: `${window.location.origin}?session=${sessionId}&payment=cancelled`,
    },
  });

  if (error) return { error: error.message };
  return data as { url: string };
}

export async function verifyPayment(sessionId: string): Promise<{ paid: boolean; error?: string }> {
  if (!isSupabaseConfigured()) return { paid: false, error: 'Supabase not configured' };

  const { data, error } = await supabase.functions.invoke('verify-payment', {
    body: { sessionId },
  });

  if (error) return { paid: false, error: error.message };
  return data as { paid: boolean };
}
