// Removed import of '@/env' – using process.env directly

/**
 * Scrape a website using TinyFish API.
 * Expects the TinyFish endpoint to be `https://api.tinyfish.ai/v1/scrape`.
 * The API key should be provided via the environment variable `TINYFISH_API_KEY`.
 */
export async function scrapeWithTinyFish(url: string): Promise<string> {
  if (!url) throw new Error('No URL provided');

  const apiKey = process.env.TINYFISH_API_KEY;
  if (!apiKey) {
    throw new Error('TINYFISH_API_KEY not configured in environment');
  }

  const endpoint = 'https://api.tinyfish.ai/v1/scrape';
  const payload = {
    url,
    // Optional parameters: you can adjust these per TinyFish docs.
    // Here we ask for plain text extraction.
    extract: 'text',
  };

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
    // TinyFish may take a few seconds; set a reasonable timeout.
    signal: AbortSignal.timeout(45_000),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`TinyFish scrape failed (${res.status}): ${errBody}`);
  }

  const data = await res.json();
  // TinyFish typically returns { content: "..." } or similar.
  // We'll be defensive and fallback to raw response if needed.
  if (typeof data === 'string') return data;
  if (data?.content) return data.content;
  if (data?.text) return data.text;
  // Fallback: stringify the whole response.
  return JSON.stringify(data);
}
