import type { Handler, HandlerEvent, HandlerContext } from "@netlify/functions";
import * as cheerio from "cheerio";

// Helper to determine how "vibrant" a color is (to prioritize brand colors over grays)
function getVibrancy(hex: string) {
    hex = hex.replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
    const r = parseInt(hex.substring(0, 2), 16) / 255;
    const g = parseInt(hex.substring(2, 4), 16) / 255;
    const b = parseInt(hex.substring(4, 6), 16) / 255;
    
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let s = 0;
    if (max !== min) {
        const l = (max + min) / 2;
        s = l > 0.5 ? (max - min) / (2 - max - min) : (max - min) / (max + min);
    }
    return s; // Returns 0 to 1 (0 is grayscale, 1 is fully saturated)
}

function getMostFrequent(arr: string[], count = 1, defaultVal = '', type = 'font') {
    const freq: Record<string, number> = {};
    for (const item of arr) {
        if (item) freq[item] = (freq[item] || 0) + 1;
    }
    
    let sorted = Object.entries(freq);
    
    if (type === 'color') {
        // Sort colors by a combination of frequency and vibrancy
        // This ensures a vibrant orange used 5 times beats a generic gray used 10 times
        sorted.sort((a, b) => {
            const scoreA = a[1] * (getVibrancy(a[0]) + 0.3); 
            const scoreB = b[1] * (getVibrancy(b[0]) + 0.3);
            return scoreB - scoreA;
        });
    } else {
        sorted.sort((a, b) => b[1] - a[1]);
    }
    
    const results = sorted.map(e => e[0]);
    if (count === 1) return results[0] || defaultVal;
    return results.slice(0, count);
}

// Fetch helper with timeout
async function fetchWithTimeout(url: string, ms: number) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), ms);
    try {
        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(id);
        return await response.text();
    } catch (e) {
        clearTimeout(id);
        return '';
    }
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
    const html = await fetchWithTimeout(url, 6500);

    if (!html) {
      return { statusCode: 400, body: JSON.stringify({ error: `Failed to fetch URL or timeout exceeded.` }) };
    }
    
    // Parse the HTML using cheerio
    const $ = cheerio.load(html);
    $('script, svg, noscript, iframe').remove();

    // 1. Fetch External Stylesheets to get real WordPress/Elementor theme colors
    const cssLinks = $('link[rel="stylesheet"]').map((i, el) => $(el).attr('href')).get();
    const targetUrlObj = new URL(url);
    const validCssLinks = cssLinks
        .filter(link => link && !link.includes('fonts.googleapis.com') && !link.includes('fontawesome'))
        .map(link => {
            if (link.startsWith('http')) return link;
            if (link.startsWith('//')) return 'https:' + link;
            return new URL(link, targetUrlObj.origin).href;
        })
        .slice(0, 3); // Max 3 external CSS files to avoid timeouts
        
    let allStyles = '';
    $('style').each((i, el) => {
        allStyles += $(el).html() + '\n';
    });

    if (validCssLinks.length > 0) {
        try {
            const cssResponses = await Promise.allSettled(
                validCssLinks.map(link => fetchWithTimeout(link, 1500))
            );
            cssResponses.forEach(res => {
                if (res.status === 'fulfilled' && res.value) {
                    allStyles += '\n' + res.value;
                }
            });
        } catch (e) {
            console.warn("Failed to fetch some external CSS");
        }
    }

    const combinedText = html + '\n' + allStyles;

    // 2. Extract Colors
    const hexRegex = /#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})\b/gi;
    const hexMatches = combinedText.match(hexRegex) || [];
    
    const hexList: string[] = [];
    hexMatches.forEach(hex => {
        const upperHex = hex.toUpperCase();
        // Normalize 3-char hex to 6-char hex
        const normalized = upperHex.length === 4 
            ? '#' + upperHex[1]+upperHex[1]+upperHex[2]+upperHex[2]+upperHex[3]+upperHex[3] 
            : upperHex;
            
        // Discard pure whites and pure blacks from being tracked as main brand colors
        if (normalized !== '#FFFFFF' && normalized !== '#000000') {
             hexList.push(normalized);
        }
    });

    const topColors = getMostFrequent(hexList, 4, '', 'color') as string[];
        
    const fallbackColors = ['#0A0D14', '#FF3B30', '#FF9500', '#007AFF'];
    const primary = topColors[0] || fallbackColors[0];
    const secondary = topColors[1] || topColors[0] || fallbackColors[1];
    const accent = topColors[2] || topColors[0] || fallbackColors[2];
    const button = topColors[3] || topColors[1] || topColors[0] || fallbackColors[3];
    
    // 3. Extract Fonts
    const fontRegex = /font-family:\s*([^;}]+)/gi;
    const fontMatches: string[] = [];
    let match;
    const invalidFonts = ['inherit', 'initial', 'unset', 'sans-serif', 'serif', 'monospace', 'system-ui', 'arial', 'helvetica', 'var', 'blinkmacsystemfont', 'segoe ui', 'roboto', 'apple color emoji', 'tahoma', 'verdana'];
    
    while ((match = fontRegex.exec(allStyles)) !== null) {
        let family = match[1].split(',')[0].replace(/['"]/g, '').trim();
        if(family && !invalidFonts.some(inv => family.toLowerCase().includes(inv))) {
            fontMatches.push(family);
        }
    }
    
    // Check Google Fonts links
    $('link[rel="stylesheet"]').each((i, el) => {
        const href = $(el).attr('href') || '';
        if (href.includes('fonts.googleapis.com')) {
            const urlParams = new URLSearchParams(href.split('?')[1] || '');
            const families = urlParams.getAll('family');
            families.forEach(f => {
                const familyName = f.split(':')[0].replace(/\+/g, ' ');
                if (familyName && !invalidFonts.some(inv => familyName.toLowerCase().includes(inv))) {
                    fontMatches.push(familyName);
                }
            });
        }
    });

    let topFonts = getMostFrequent(fontMatches, 4, 'Inter', 'font') as string[];
    if (topFonts.length === 0) topFonts = ["Inter", "System UI"];
    
    const mainFont = topFonts[0];
    const headingFont = topFonts.length > 1 ? topFonts[0] : mainFont;
    const bodyFont = topFonts.length > 1 ? topFonts[1] : mainFont;

    // 4. Extract Border Radius
    const radiusRegex = /border-radius:\s*([^;}]+)/gi;
    const radiusMatches: string[] = [];
    while ((match = radiusRegex.exec(allStyles)) !== null) {
        if (!match[1].includes('var(')) radiusMatches.push(match[1].trim());
    }
    const topRadius = getMostFrequent(radiusMatches, 1, '8px') as string;
    let radiusText = 'Sharp 0px';
    const radiusVal = parseInt(topRadius);
    if (topRadius.includes('%') || radiusVal > 20) radiusText = `Pill ${topRadius}`;
    else if (radiusVal > 0) radiusText = `Rounded ${topRadius}`;

    // 5. Extract Shadows
    const shadowRegex = /box-shadow:\s*([^;}]+)/gi;
    const shadowMatches: string[] = [];
    while ((match = shadowRegex.exec(allStyles)) !== null) {
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
