/** GIPHY API for GIF search. Get free API key at https://developers.giphy.com/dashboard */

const GIPHY_API_KEY = import.meta.env.VITE_GIPHY_API_KEY || '';

export interface GiphyGif {
  id: string;
  url: string;
  title: string;
  images: {
    fixed_height: { url: string; width: string; height: string };
    fixed_height_small: { url: string };
    original: { url: string };
  };
}

export interface GiphySearchResponse {
  data: Array<{
    id: string;
    title: string;
    images: {
      fixed_height: { url: string; width: string; height: string };
      fixed_height_small: { url: string };
      original: { url: string };
    };
  }>;
}

export async function searchGifs(query: string, limit = 24): Promise<GiphyGif[]> {
  if (!GIPHY_API_KEY) return [];
  try {
    const res = await fetch(
      `https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_API_KEY}&q=${encodeURIComponent(query)}&limit=${limit}&rating=g`
    );
    const json = await res.json();
    return (json.data || []).map((g: any) => ({
      id: g.id,
      url: g.images?.original?.url || g.images?.fixed_height?.url,
      title: g.title || '',
      images: g.images,
    }));
  } catch {
    return [];
  }
}

export async function getTrendingGifs(limit = 24): Promise<GiphyGif[]> {
  if (!GIPHY_API_KEY) return [];
  try {
    const res = await fetch(
      `https://api.giphy.com/v1/gifs/trending?api_key=${GIPHY_API_KEY}&limit=${limit}&rating=g`
    );
    const json = await res.json();
    return (json.data || []).map((g: any) => ({
      id: g.id,
      url: g.images?.original?.url || g.images?.fixed_height?.url,
      title: g.title || '',
      images: g.images,
    }));
  } catch {
    return [];
  }
}

export function isGiphyConfigured(): boolean {
  return !!GIPHY_API_KEY;
}
