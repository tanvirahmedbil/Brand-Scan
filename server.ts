import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import * as cheerio from "cheerio";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  app.post("/api/analyze-brand", async (req, res) => {
    try {
      const { url } = req.body;
      if (!url) {
        return res.status(400).json({ error: "URL is required" });
      }

      // Fetch the webpage HTML
      const response = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        },
      });

      if (!response.ok) {
        return res
          .status(400)
          .json({ error: `Failed to fetch URL: ${response.statusText}` });
      }

      const html = await response.text();
      
      // We parse the HTML using cheerio to reduce size by removing scripts/svgs and extracting text and styles.
      const $ = cheerio.load(html);
      
      $('script').remove();
      $('svg').remove();
      $('noscript').remove();
      $('iframe').remove();

      let styles = '';
      $('style').each((i, el) => {
          styles += $(el).html() + '\n';
      });

      const bodyText = $('body').text().replace(/\s+/g, ' ').trim().slice(0, 10000); // Send up to 10k chars of body text
      const headLinks = $('head link[rel="stylesheet"]').map((i, el) => $(el).attr('href')).get().join(', ');
      const images = $('img').map((i, el) => $(el).attr('src')).get().join(', ');
      const headStyles = styles.slice(0, 20000); // Up to 20k chars of styles

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
        return res.json(JSON.parse(text));
      } else {
         return res.status(500).json({ error: "Failed to generate response." });
      }

    } catch (error: any) {
      console.error(error);
      return res.status(500).json({ error: error.message || "An unexpected error occurred." });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
