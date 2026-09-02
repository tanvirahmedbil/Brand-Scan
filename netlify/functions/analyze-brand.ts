import type { Handler, HandlerEvent, HandlerContext } from "@netlify/functions";
import { GoogleGenAI, Type } from "@google/genai";
import * as cheerio from "cheerio";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

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
    
    // Parse the HTML using cheerio to extract text and styles
    const $ = cheerio.load(html);
    
    $('script').remove();
    $('svg').remove();
    $('noscript').remove();
    $('iframe').remove();

    let styles = '';
    $('style').each((i, el) => {
        styles += $(el).html() + '\n';
    });

    const bodyText = $('body').text().replace(/\s+/g, ' ').trim().slice(0, 3000);
    const headLinks = $('head link[rel="stylesheet"]').map((i, el) => $(el).attr('href')).get().join(', ');
    const images = $('img').map((i, el) => $(el).attr('src')).get().join(', ').slice(0, 1000);
    const headStyles = styles.slice(0, 3000);

    const contextText = `
      Here is some context extracted from the URL: ${url}
      Images found on the page: ${images}
      Stylesheets referenced: ${headLinks}
      Inline Styles: ${headStyles}
      Body Text Snippet: ${bodyText}
    `;

    const genResponse = await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents: [
        {
          role: "user",
          parts: [{
            text: `You are an expert brand analyst and web designer. Extract a formatted guide for the branding idea from the provided website context.
            If you cannot find exact colors, logo, or typography, infer them based on standard modern web design practices that match the context.
            
            Keep it minimal. Only return the necessary info matching the schema exactly.
            
            Context:
            ${contextText}`
          }]
        }
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            colors: {
              type: Type.OBJECT,
              properties: {
                primary: { type: Type.STRING, description: "Primary brand color HEX code" },
                secondary: { type: Type.STRING, description: "Secondary brand color HEX code" },
                accent: { type: Type.STRING, description: "Accent brand color HEX code" },
                button: { type: Type.STRING, description: "Button or call-to-action color HEX code" },
              },
              required: ["primary", "secondary", "accent", "button"]
            },
            uiStyling: {
              type: Type.OBJECT,
              properties: {
                borderRadius: { type: Type.STRING, description: "General border radius style used for UI components (e.g., Sharp 0px, Soft Rounded 8px, Pill 99px)" },
                shadowStyle: { type: Type.STRING, description: "General shadow or depth style for UI components (e.g., Flat brutalist, Soft diffused, Hard offset)" }
              },
              required: ["borderRadius", "shadowStyle"]
            },
            typography: {
              type: Type.OBJECT,
              properties: {
                fonts: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: "List of main font families used"
                },
                headings: {
                  type: Type.OBJECT,
                  properties: {
                    h1: {
                      type: Type.OBJECT,
                      properties: {
                        fontFamily: { type: Type.STRING },
                        fontSize: { type: Type.STRING },
                        lineHeight: { type: Type.STRING }
                      },
                      required: ["fontFamily", "fontSize", "lineHeight"]
                    },
                    h2: {
                      type: Type.OBJECT,
                      properties: {
                        fontFamily: { type: Type.STRING },
                        fontSize: { type: Type.STRING },
                        lineHeight: { type: Type.STRING }
                      },
                      required: ["fontFamily", "fontSize", "lineHeight"]
                    },
                    h3: {
                      type: Type.OBJECT,
                      properties: {
                        fontFamily: { type: Type.STRING },
                        fontSize: { type: Type.STRING },
                        lineHeight: { type: Type.STRING }
                      },
                      required: ["fontFamily", "fontSize", "lineHeight"]
                    }
                  },
                  required: ["h1", "h2", "h3"]
                },
                bodyText: {
                  type: Type.OBJECT,
                  properties: {
                    fontFamily: { type: Type.STRING },
                    fontSize: { type: Type.STRING },
                    lineHeight: { type: Type.STRING }
                  },
                  required: ["fontFamily", "fontSize", "lineHeight"]
                }
              },
              required: ["fonts", "headings", "bodyText"]
            }
          },
          required: ["colors", "uiStyling", "typography"]
        }
      }
    });

    const text = genResponse.text;
    if (text) {
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(JSON.parse(text)),
      };
    } else {
      return { statusCode: 500, body: JSON.stringify({ error: "Failed to generate response." }) };
    }

  } catch (error: any) {
    console.error(error);
    if (error.name === 'AbortError') {
      return { statusCode: 504, body: JSON.stringify({ error: "The target website took too long to respond. Please try another URL." }) };
    }
    return { statusCode: 500, body: JSON.stringify({ error: error.message || "An unexpected error occurred." }) };
  }
};

export { handler };
