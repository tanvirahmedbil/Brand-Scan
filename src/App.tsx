/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Download, Loader2, Link2, Palette, Type, Image as ImageIcon, AlertCircle } from 'lucide-react';
import type { BrandGuide } from './types';

export default function App() {
  const [url, setUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [brandGuide, setBrandGuide] = useState<BrandGuide | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url) return;

    // Basic URL validation
    let validUrl = url;
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      validUrl = `https://${url}`;
    }

    setIsLoading(true);
    setError(null);
    setBrandGuide(null);

    try {
      const response = await fetch('/api/analyze-brand', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: validUrl }),
      });

      if (!response.ok) {
        let errorMessage = 'Failed to analyze website';
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch (parseErr) {
          // If JSON parsing fails (e.g., received an HTML 404 page from Netlify)
          errorMessage = `Server Error (${response.status}): The API endpoint could not be reached.`;
        }
        throw new Error(errorMessage);
      }

      const data: BrandGuide = await response.json();
      setBrandGuide(data);
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownload = () => {
    if (!brandGuide) return;
    
    const summary = `
Brand Guide for: ${url}

--- COLORS ---
Primary: ${brandGuide.colors.primary}
Secondary: ${brandGuide.colors.secondary}
Accent: ${brandGuide.colors.accent}
Button: ${brandGuide.colors.button}

--- UI STYLING ---
Border Radius: ${brandGuide.uiStyling.borderRadius}
Shadows/Depth: ${brandGuide.uiStyling.shadowStyle}

--- TYPOGRAPHY ---
Main Fonts: ${brandGuide.typography.fonts.join(', ')}

[Headings]
H1: ${brandGuide.typography.headings.h1.fontFamily} | ${brandGuide.typography.headings.h1.fontSize} | Line Height: ${brandGuide.typography.headings.h1.lineHeight}
H2: ${brandGuide.typography.headings.h2.fontFamily} | ${brandGuide.typography.headings.h2.fontSize} | Line Height: ${brandGuide.typography.headings.h2.lineHeight}
H3: ${brandGuide.typography.headings.h3.fontFamily} | ${brandGuide.typography.headings.h3.fontSize} | Line Height: ${brandGuide.typography.headings.h3.lineHeight}

[Body Text]
Text: ${brandGuide.typography.bodyText.fontFamily} | ${brandGuide.typography.bodyText.fontSize} | Line Height: ${brandGuide.typography.bodyText.lineHeight}
    `.trim();

    const blob = new Blob([summary], { type: 'text/plain' });
    const downloadUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = downloadUrl;
    const formattedUrl = url.startsWith('http') ? url : 'https://' + url;
    a.download = `brand-guide-${new URL(formattedUrl).hostname}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(downloadUrl);
  };

  return (
    <div className="flex flex-col min-h-screen w-full bg-[#FAF9F6] font-sans text-[#1A1A1A] overflow-y-auto p-4 md:p-8">
      <div className="max-w-6xl w-full mx-auto flex flex-col flex-1">
        {/* Header */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-end mb-12 border-b-2 border-black pb-4 gap-4">
          <motion.h1 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-4xl md:text-5xl font-black tracking-tighter uppercase"
          >
            Brand:Scan
          </motion.h1>
          <motion.p 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-neutral-500 text-sm font-bold uppercase tracking-widest max-w-sm text-left md:text-right"
          >
            Instantly extract branding guides
          </motion.p>
        </header>

        {/* Input Form */}
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="mb-12 flex justify-start"
        >
          <form onSubmit={handleSubmit} className="w-full max-w-2xl">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <div className="flex-1 flex items-center w-full relative">
                <Link2 className="absolute left-0 h-5 w-5 text-neutral-400" />
                <input
                  type="text"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://example.com"
                  className="bg-transparent border-b border-black text-lg py-2 pl-8 pr-2 w-full focus:outline-none placeholder-neutral-400 font-mono"
                  disabled={isLoading}
                />
              </div>
              <button
                type="submit"
                disabled={isLoading || !url}
                className="w-full sm:w-auto bg-black text-white px-8 py-3 text-sm font-bold uppercase tracking-widest hover:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
              >
                {isLoading ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="animate-spin h-4 w-4" />
                    Scanning
                  </span>
                ) : (
                  'New Scan'
                )}
              </button>
            </div>
            {error && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="mt-4 flex items-center gap-2 text-red-600 text-sm font-bold tracking-widest uppercase"
              >
                <AlertCircle className="h-4 w-4 shrink-0" />
                <p>{error}</p>
              </motion.div>
            )}
          </form>
        </motion.div>

        {/* Results */}
        <AnimatePresence mode="wait">
          {brandGuide && !isLoading && (
            <motion.div
              key="results"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.4 }}
              className="flex-1 flex flex-col"
            >
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 flex-1">
                <section className="lg:col-span-4 flex flex-col gap-8">
                  {/* Colors */}
                  <div className="border-2 border-black p-6 bg-white shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
                    <h2 className="text-xs font-bold uppercase tracking-[0.2em] mb-6 text-neutral-400">01 / Color Palette</h2>
                    <div className="space-y-4">
                      <ColorSwatch label="Primary" color={brandGuide.colors.primary} />
                      <ColorSwatch label="Secondary" color={brandGuide.colors.secondary} />
                      <ColorSwatch label="Accent" color={brandGuide.colors.accent} />
                      <ColorSwatch label="Button" color={brandGuide.colors.button} />
                    </div>
                  </div>

                  {/* UI Styling */}
                  <div className="border-2 border-black p-6 bg-white flex-1 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] flex flex-col">
                    <h2 className="text-xs font-bold uppercase tracking-[0.2em] mb-6 text-neutral-400">02 / UI Components</h2>
                    <div className="flex-1 flex flex-col justify-center border border-dashed border-neutral-300 bg-neutral-50 p-6 min-h-[160px] gap-6">
                      <div className="text-center">
                        <span className="text-[10px] uppercase font-bold text-neutral-400 block mb-2">Border Radius</span>
                        <div className="text-xl font-bold tracking-tight text-[#0A2540]">{brandGuide.uiStyling.borderRadius}</div>
                      </div>
                      <div className="text-center">
                         <span className="text-[10px] uppercase font-bold text-neutral-400 block mb-2">Shadows & Depth</span>
                         <div className="text-xl font-bold tracking-tight text-[#0A2540]">{brandGuide.uiStyling.shadowStyle}</div>
                      </div>
                    </div>
                  </div>
                </section>

                <section className="lg:col-span-8 flex flex-col h-full">
                  {/* Typography */}
                  <div className="border-2 border-black p-6 bg-white h-full shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] flex flex-col">
                    <h2 className="text-xs font-bold uppercase tracking-[0.2em] mb-8 text-neutral-400">03 / Typography System</h2>
                    
                    <div className="mb-6 flex gap-2 flex-wrap">
                      <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest mr-2 self-center">Families:</span>
                      {brandGuide.typography.fonts.map((font, idx) => (
                        <span key={idx} className="font-mono text-sm font-bold bg-neutral-100 px-2 py-1">
                          {font}
                        </span>
                      ))}
                    </div>

                    <div className="space-y-6 flex-1">
                      <div className="grid grid-cols-12 border-b border-neutral-100 pb-4 hidden md:grid">
                        <div className="col-span-3 text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Level</div>
                        <div className="col-span-4 text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Family</div>
                        <div className="col-span-2 text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Size</div>
                        <div className="col-span-3 text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Line Height</div>
                      </div>
                      
                      <TypographyRow tag="H1" style={brandGuide.typography.headings.h1} sample="Sphinx of black quartz, judge my vow." />
                      <TypographyRow tag="H2" style={brandGuide.typography.headings.h2} />
                      <TypographyRow tag="H3" style={brandGuide.typography.headings.h3} />
                      <TypographyRow tag="Body" style={brandGuide.typography.bodyText} sample="Millions of companies of all sizes use this typography online and in person to build their brands." />
                    </div>
                  </div>
                </section>
              </div>

              <footer className="mt-12 flex flex-col md:flex-row justify-between items-start md:items-center gap-6 border-t-2 border-black pt-8 mb-8">
                <div className="flex gap-8">
                  <div className="flex flex-col">
                    <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest mb-1">Status</span>
                    <span className="text-sm font-bold text-green-600">COMPLETED</span>
                  </div>
                </div>
                <button 
                  onClick={handleDownload}
                  className="flex items-center gap-3 bg-black text-white px-8 py-4 font-bold uppercase tracking-widest hover:scale-[1.02] active:scale-[0.98] transition-transform w-full md:w-auto justify-center"
                >
                  <Download className="h-5 w-5" />
                  Download Summary
                </button>
              </footer>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function ColorSwatch({ label, color }: { label: string; color: string }) {
  const safeColor = color?.startsWith('#') || color?.startsWith('rgb') ? color : '#e7e5e4';
  
  return (
    <div className="flex items-center gap-4">
      <div 
        className="w-16 h-16 border border-black shrink-0"
        style={{ backgroundColor: safeColor }}
      />
      <div className="flex flex-col overflow-hidden">
        <span className="text-xs font-bold text-neutral-400 uppercase tracking-widest">{label}</span>
        <span className="font-mono text-sm truncate" title={color}>{color || 'N/A'}</span>
      </div>
    </div>
  );
}

function TypographyRow({ tag, style, sample }: { tag: string; style: any; sample?: string }) {
  const isHeading = tag.startsWith('H');
  return (
    <div className="flex flex-col border-b border-neutral-100 last:border-0 pb-4 last:pb-0">
      <div className="grid grid-cols-1 md:grid-cols-12 items-baseline py-2 gap-2 md:gap-0">
        <div className={`md:col-span-3 font-bold ${tag === 'H1' ? 'text-2xl' : tag === 'H2' ? 'text-xl' : tag === 'H3' ? 'text-lg' : 'text-base'}`}>
          <span className="md:hidden text-[10px] text-neutral-400 tracking-widest uppercase mr-2 font-normal">Level</span>
          {tag}
        </div>
        <div className="md:col-span-4 font-medium truncate" title={style.fontFamily}>
          <span className="md:hidden text-[10px] text-neutral-400 tracking-widest uppercase mr-2 font-normal">Family</span>
          {style.fontFamily}
        </div>
        <div className="md:col-span-2 font-mono text-sm">
          <span className="md:hidden text-[10px] text-neutral-400 tracking-widest uppercase mr-2 font-normal">Size</span>
          {style.fontSize}
        </div>
        <div className="md:col-span-3 font-mono text-sm text-neutral-500">
          <span className="md:hidden text-[10px] text-neutral-400 tracking-widest uppercase mr-2 font-normal">Height</span>
          {style.lineHeight}
        </div>
      </div>
      {sample && (
        <div className={`mt-2 py-4 px-6 bg-neutral-50 border border-neutral-200 ${isHeading ? 'italic text-2xl md:text-3xl font-bold' : 'text-sm leading-relaxed text-neutral-600'}`} style={{ fontFamily: style.fontFamily }}>
          {sample}
        </div>
      )}
    </div>
  );
}
