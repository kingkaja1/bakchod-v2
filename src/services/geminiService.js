import { generateRoastWithFunction } from './backend';

const FALLBACK_ROASTS = [
  'Bro, even your Wi‑Fi buffers with you. 📶💀',
  'Scene set hai, but tu offline hi lagta hai. 😎📵',
  'Your vibe is on airplane mode, beta. ✈️😶',
  'Itni bakchodi? CPU bhi garam ho gaya. 🔥🖥️',
  'Tu late night legend nahi, late night loading hai. ⏳😂',
  'Roast nahi, full fry mode activated. 🍳😈',
  'Tera swag low battery pe hai. 🔋😅',
  'Bhai, tera status: buffering... 😂',
  'Influencer nahi, inbox sufferer. 📥💔',
  'Hinglish me kahu? Beta, chill kar. 🧊😏',
];

const getFallbackRoast = (context) => {
  const seed = Array.from(context).reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return FALLBACK_ROASTS[seed % FALLBACK_ROASTS.length];
};

export const generateRoast = async (context) => {
  try {
    const response = await generateRoastWithFunction(context);
    const text = typeof response?.text === 'string' ? response.text : '';
    return text.trim() || getFallbackRoast(context);
  } catch (error) {
    console.error('Roast Function Error:', error);
    return getFallbackRoast(context);
  }
};
