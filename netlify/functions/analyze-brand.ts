import type { Handler, HandlerEvent, HandlerContext } from "@netlify/functions";
import * as cheerio from "cheerio";

function getMostFrequent(arr: string[], count = 1, defaultVal = '') {
    const freq: Record<string, number> = {};
    for (const item of arr) {
        if (item) freq[item] = (freq[item] || 0) + 1;
    }
    const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1]).map(e => e[0]);
    if (count === 1) return sorted[0] || defaultVal;
    return sorted.slice(0, count);
}

const handler: Handler = async (event: HandlerEvent, context: HandlerContext) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const { url } = body;
    if (!url) {
      return { statusCode: 400, body: JSON.stringify({ error: "URL is required" }) };
    }

    // Fetch the webpage HTML with a generous timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8500); // 8.5 seconds max

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
      },
    });
    
    clearTimeout(timeoutId);

    if (!response.ok) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: `Failed to fetch URL: ${response.statusText}` }),
      };
    }

    const html = await response.text();
    
    // Extract Hex Colors
    const hexRegex = /#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})\b/gi;
    const hexMatches = html.match(hexRegex) || [];
    const hexCounts: Record<string, number> = {};
    
    hexMatches.forEach(hex => {
        const upperHex = hex.toUpperCase();
        // Normalize 3-char hex to 6-char hex
        const normalized = upperHex.length === 4 
            ? '#' + upperHex[1]+upperHex[1]+upperHex[2]+upperHex[2]+upperHex[3]+upperHex[3] 
            : upperHex;
        hexCounts[normalized] = (hexCounts[normalized] || 0) + 1;
    });

    const topColors = Object.entries(hexCounts)
        .sort((a, b) => b[1] - a[1])
        .map(entry => entry[0]);
        
    const primary = topColors[0] || '#0A0D14';
    const secondary = topColors[1] || topColors[0] || '#FF3B30';
    const accent = topColors[2] || topColors[0] || '#FF9500';
    const button = topColors[3] || topColors[1] || topColors[0] || '#FF3B30';
    
    // Parse the HTML using cheerio
    const $ = cheerio.load(html);
    $('script, svg, noscript, iframe').remove();

    let styles = '';
    $('style').each((i, el) => {
        styles += $(el).html() + '\n';
    });

    // Font extraction
    const fontRegex = /font-family:\s*([^;}]+)/gi;
    const fontMatches: string[] = [];
    let match;
    while ((match = fontRegex.exec(styles)) !== null) {
        let family = match[1].split(',')[0].replace(/['"]/g, '').trim();
        if(family && !family.includes('var(')) fontMatches.push(family);
    }
    
    // Check Google Fonts links
    $('link[rel="stylesheet"]').each((i, el) => {
        const href = $(el).attr('href') || '';
        if (href.includes('fonts.googleapis.com')) {
            const urlParams = new URLSearchParams(href.split('?')[1] || '');
            const families = urlParams.getAll('family');
            families.forEach(f => {
                const familyName = f.split(':')[0].replace(/\+/g, ' ');
                if (familyName) fontMatches.push(familyName);
            });
        }
    });

    let topFonts = getMostFrequent(fontMatches, 4) as string[];
    if (topFonts.length === 0) topFonts = ["Inter", "System UI"];
    
    const mainFont = topFonts[0];
    const headingFont = topFonts.length > 1 ? topFonts[0] : mainFont;
    const bodyFont = topFonts.length > 1 ? topFonts[1] : mainFont;

    // Border radius
    const radiusRegex = /border-radius:\s*([^;}]+)/gi;
    const radiusMatches: string[] = [];
    while ((match = radiusRegex.exec(styles)) !== null) {
        if (!match[1].includes('var(')) radiusMatches.push(match[1].trim());
    }
    const topRadius = getMostFrequent(radiusMatches, 1, '8px') as string;
    let radiusText = 'Sharp 0px';
    const radiusVal = parseInt(topRadius);
    if (topRadius.includes('%') || radiusVal > 20) radiusText = `Pill ${topRadius}`;
    else if (radiusVal > 0) radiusText = `Rounded ${topRadius}`;

    // Shadow
    const shadowRegex = /box-shadow:\s*([^;}]+)/gi;
    const shadowMatches: string[] = [];
    while ((match = shadowRegex.exec(styles)) !== null) {
        if (!match[1].includes('none') && !match[1].includes('var(')) shadowMatches.push(match[1].trim());
    }
    const topShadow = getMostFrequent(shadowMatches, 1, 'none') as string;
    const shadowText = topShadow !== 'none' ? 'Soft diffused drop shadow' : 'Flat brutalist (No shadow)';

    const jsonResponse = {
      colors: {
        primary,
        secondary,
        accent,
        button
      },
      uiStyling: {
        borderRadius: radiusText,
        shadowStyle: shadowText
      },
      typography: {
        fonts: topFonts,
        headings: {
          h1: { fontFamily: headingFont, fontSize: "48px", lineHeight: "1.2" },
          h2: { fontFamily: headingFont, fontSize: "36px", lineHeight: "1.25" },
          h3: { fontFamily: headingFont, fontSize: "24px", lineHeight: "1.3" }
        },
        bodyText: { fontFamily: bodyFont, fontSize: "16px", lineHeight: "1.6" }
      }
    };

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(jsonResponse),
    };

  } catch (error: any) {
    console.error(error);
    if (error.name === 'AbortError') {
      return { statusCode: 504, body: JSON.stringify({ error: "The target website took too long to respond. Please try another URL." }) };
    }
    return { statusCode: 500, body: JSON.stringify({ error: error.message || "An unexpected error occurred." }) };
  }
};

export { handler };
