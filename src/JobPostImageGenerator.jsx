import React, { useEffect, useRef, useState } from "react";

// Job Post Image Generator — Clean, robust React component
// Goals: fix build/runtime issues, simplify refs, avoid fragile font strings,
// and make rendering deterministic. Paste this component into a React app
// (e.g. create-react-app, Next.js client page) as JobPostImageGenerator.jsx

const PRESETS = [
  { key: "ig_post", name: "Instagram Post", w: 1080, h: 1080, filename: "job-instagram-post.png" },
  { key: "ig_story", name: "Instagram Story", w: 1080, h: 1920, filename: "job-instagram-story.png" },
  { key: "yt_thumb", name: "YouTube Thumbnail", w: 1280, h: 720, filename: "job-youtube-thumb.png" },
  { key: "linkedin", name: "LinkedIn Share", w: 1200, h: 627, filename: "job-linkedin.png" },
  { key: "fb_post", name: "Facebook Post", w: 1200, h: 1200, filename: "job-facebook-post.png" },
];

const DEFAULT_TEXT = `BEL Recruitment 2025 – Vacancy Details
Management Industrial Trainees (Finance)
📏 Age limit
Maximum Age: 25 years
📋 Job Details
904 vacancies
🎓 Eligibility
ICWA (Inter) or CA (Inter)
💰 Salary
₹30,000
📅 Last date for submission of application
Walk-in Interview: 19-Aug-2025`;

export default function JobPostImageGenerator() {
  // --- state ---
  const [text, setText] = useState(DEFAULT_TEXT);
  const [bgA, setBgA] = useState("#0ea5e9");
  const [bgB, setBgB] = useState("#1d4ed8");
  const [textColor, setTextColor] = useState("#ffffff");
  const [fontFamily, setFontFamily] = useState("Noto Sans"); // use simple family name (we'll quote when sending to canvas)
  const [logoDataUrl, setLogoDataUrl] = useState(null);

  // canvas element refs (callback refs)
  const canvasRefs = useRef({});

  // logo image element
  const logoImgRef = useRef(null);

  // ensure fonts are injected once (safe in client-side apps)
  useEffect(() => {
    try {
      if (typeof document !== "undefined" && !document.getElementById("noto-fonts-js")) {
        const link = document.createElement("link");
        link.id = "noto-fonts-js";
        link.rel = "stylesheet";
        // include the core Noto Sans family + Devanagari and Kannada subsets for broader coverage
        link.href = "https://fonts.googleapis.com/css2?family=Noto+Sans:wght@400;600;700&family=Noto+Sans+Devanagari:wght@400;600;700&family=Noto+Sans+Kannada:wght@400;600;700&display=swap";
        document.head.appendChild(link);
      }
    } catch (e) {
      // ignore in SSR or restricted environments
      // console.warn('fonts injection failed', e);
    }
  }, []);

  // when logo data url changes, load into image element
  useEffect(() => {
    if (!logoDataUrl) {
      logoImgRef.current = null;
      // trigger redraw by calling renderPreviews via next tick
      setTimeout(() => renderPreviews(), 0);
      return;
    }
    const img = new Image();
    img.onload = () => {
      logoImgRef.current = img;
      setTimeout(() => renderPreviews(), 0);
    };
    img.onerror = () => {
      logoImgRef.current = null;
      setTimeout(() => renderPreviews(), 0);
    };
    img.src = logoDataUrl;
  }, [logoDataUrl]);

  // redraw when inputs change
  useEffect(() => {
    // small debounce using setTimeout ensures FontFace loading (if needed) has a chance
    const id = setTimeout(() => renderPreviews(), 60);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, bgA, bgB, textColor, fontFamily, logoDataUrl]);

  // ---------------- utility functions ----------------
  function quoteFontName(name) {
    // If the font family contains space(s), quote it for canvas font
    if (!name) return '"Noto Sans"';
    return name.includes(" ") ? `"${name.replace(/\"/g, '')}"` : name;
  }

  function tokenizeWords(text) {
    return (text || "").split(/\s+/).filter(Boolean);
  }

  function wrapByWidth(ctx, text, maxW) {
    // Returns array of lines where each line fits within maxW.
    if (!text) return [];
    const tokens = tokenizeWords(text);
    const lines = [];
    let line = "";
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      const test = line ? `${line} ${t}` : t;
      if (ctx.measureText(test).width <= maxW) {
        line = test;
      } else if (line) {
        lines.push(line);
        line = t;
      } else {
        // single token longer than maxW — split it by characters
        let chunk = "";
        for (const ch of t) {
          const test2 = chunk + ch;
          if (ctx.measureText(test2).width <= maxW) chunk = test2;
          else {
            if (chunk) lines.push(chunk);
            chunk = ch;
          }
        }
        if (chunk) line = chunk; else line = "";
      }
    }
    if (line) lines.push(line);
    return lines;
  }

  function measureParagraph(ctx, text, maxW, lineHeight) {
    const lines = wrapByWidth(ctx, text, maxW);
    return { lines, height: lines.length * lineHeight };
  }

  function fitFontBinaryParagraph(ctx, text, maxW, maxH, minPx, maxPx, fontFamilyName, lineGap = 1.18) {
    // Binary search for largest font size (px) where paragraph fits in maxH
    let lo = minPx, hi = maxPx, best = minPx, bestLines = [];
    const quoted = quoteFontName(fontFamilyName);
    while (lo <= hi) {
      const mid = Math.floor((lo + hi) / 2);
      ctx.font = `${mid}px ${quoted}`;
      const lh = Math.ceil(mid * lineGap);
      const m = measureParagraph(ctx, text, maxW, lh);
      if (m.height <= maxH) { best = mid; bestLines = m.lines; lo = mid + 1; } else { hi = mid - 1; }
    }
    const lh = Math.ceil(best * lineGap);
    ctx.font = `${best}px ${quoted}`;
    const final = measureParagraph(ctx, text, maxW, lh);
    return { fontPx: best, lineHeight: lh, lines: final.lines };
  }

  function fitFontBinaryTable(ctx, rows, colLeftW, colRightW, maxH, minPx, maxPx, fontFamilyName, lineGap = 1.15) {
    // Binary search font size so entire table fits inside maxH
    let lo = minPx, hi = maxPx, best = minPx, bestResult = null;
    const quoted = quoteFontName(fontFamilyName);
    while (lo <= hi) {
      const mid = Math.floor((lo + hi) / 2);
      const lh = Math.ceil(mid * lineGap);
      let totalH = 0;
      const wrapped = [];
      for (const r of rows) {
        ctx.font = `600 ${mid}px ${quoted}`;
        const leftLines = wrapByWidth(ctx, r.key, colLeftW);
        ctx.font = `${mid}px ${quoted}`;
        const rightLines = wrapByWidth(ctx, r.value, colRightW);
        const rowH = Math.max(leftLines.length, rightLines.length) * lh;
        wrapped.push({ left: leftLines, right: rightLines, rowH });
        totalH += rowH + Math.round(lh * 0.35);
      }
      if (totalH > 0) totalH -= Math.round(lh * 0.35);
      if (totalH <= maxH) { best = mid; bestResult = { fontPx: mid, lineHeight: lh, wrapped }; lo = mid + 1; } else { hi = mid - 1; }
    }
    if (bestResult) return bestResult;
    // Fallback small size
    const fallbackLh = Math.ceil(minPx * lineGap);
    const fallback = rows.map((r) => ({ left: wrapByWidth(ctx, r.key, colLeftW), right: wrapByWidth(ctx, r.value, colRightW), rowH: Math.max(1, Math.max(wrapByWidth(ctx, r.key, colLeftW).length, wrapByWidth(ctx, r.value, colRightW).length)) }));
    return { fontPx: minPx, lineHeight: fallbackLh, wrapped: fallback };
  }

  function drawRoundedRect(ctx, x, y, w, h, r) {
    const min = Math.min(w, h); if (r * 2 > min) r = min / 2;
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  // ---------------- drawing ----------------
  async function drawOne(canvas, w, h, opts) {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    canvas.width = w; canvas.height = h;

    const { bgA: a, bgB: b, textColor: tColor, fontFamily: fFam, logoImg, text: inputText } = opts;

    try {
      if (typeof document !== "undefined" && document.fonts && document.fonts.ready) await document.fonts.ready;
    } catch (e) {
      // ignore font loading errors
    }

    // background gradient
    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, a); grad.addColorStop(1, b);
    ctx.fillStyle = grad; ctx.fillRect(0, 0, w, h);

    // card container
    const s = Math.min(w, h);
    const pad = Math.round(s * 0.06);
    const inner = Math.round(s * 0.045);
    const cardX = pad, cardY = pad, cardW = w - pad * 2, cardH = h - pad * 2;
    drawRoundedRect(ctx, cardX, cardY, cardW, cardH, Math.round(s * 0.04));
    ctx.fillStyle = "rgba(255,255,255,0.08)"; ctx.fill();

    let y = cardY + inner;
    const x = cardX + inner;
    const contentW = cardW - inner * 2;

    // optional logo row
    if (logoImg) {
      const maxH = Math.round(s * 0.12);
      const ratio = logoImg.width / Math.max(1, logoImg.height);
      const lh = Math.round(maxH * 0.8);
      const lw = Math.min(Math.round(contentW * 0.28), Math.round(lh * ratio));
      const ly = y + Math.round((maxH - lh) / 2);
      try { ctx.drawImage(logoImg, x, ly, lw, lh); } catch (e) { /* drawing error */ }
      y += maxH + Math.round(s * 0.02);
    }

    // parse lines
    const lines = (inputText || "").replace(/\r/g, "").split("\n").map(l => l.trim()).filter(Boolean);
    const title = lines[0] || "";
    const subtitle = lines[1] || "";
    const pairs = [];
    for (let i = 2; i < lines.length; i += 2) {
      const k = lines[i] || "";
      const v = lines[i + 1] || "";
      if (k || v) pairs.push({ key: k, value: v });
    }

    // allocate zones
    const titleBoxH = Math.round(cardH * 0.20);
    const subBoxH = Math.round(cardH * 0.12);
    const tableBoxH = cardH - (y - cardY) - titleBoxH - subBoxH - inner;

    // Title
    const maxTitlePx = Math.max(14, Math.floor(s * 0.10));
    const titleFit = fitFontBinaryParagraph(ctx, title, contentW, titleBoxH, 12, maxTitlePx, fFam, 1.18);
    ctx.fillStyle = tColor; ctx.textAlign = "center"; ctx.textBaseline = "top";
    ctx.font = `700 ${titleFit.fontPx}px ${quoteFontName(fFam)}`;
    let ty = y + Math.max(0, Math.floor((titleBoxH - titleFit.lines.length * titleFit.lineHeight) / 2));
    for (const ln of titleFit.lines) { ctx.fillText(ln, x + contentW / 2, ty); ty += titleFit.lineHeight; }
    y += titleBoxH;

    // Subtitle
    const maxSubPx = Math.max(12, Math.floor(s * 0.065));
    const subFit = fitFontBinaryParagraph(ctx, subtitle, contentW, subBoxH, 10, maxSubPx, fFam, 1.18);
    ctx.font = `600 ${subFit.fontPx}px ${quoteFontName(fFam)}`;
    let sy = y + Math.max(0, Math.floor((subBoxH - subFit.lines.length * subFit.lineHeight) / 2));
    for (const ln of subFit.lines) { ctx.fillText(ln, x + contentW / 2, sy); sy += subFit.lineHeight; }
    y += subBoxH;

    // Table
    const colGap = Math.round(s * 0.02);
    const colLeftW = Math.floor(contentW * 0.36);
    const colRightW = contentW - colLeftW - colGap;
    const maxTablePx = Math.max(10, Math.floor(s * 0.055));
    const tableFit = fitFontBinaryTable(ctx, pairs, colLeftW, colRightW, tableBoxH, 9, maxTablePx, fFam, 1.12);

    ctx.textAlign = "left";
    let rowY = y;
    for (let i = 0; i < tableFit.wrapped.length; i++) {
      const wRow = tableFit.wrapped[i];
      ctx.font = `700 ${tableFit.fontPx}px ${quoteFontName(fFam)}`;
      let ly = rowY;
      for (const L of wRow.left) { ctx.fillText(L, x, ly); ly += tableFit.lineHeight; }
      ctx.font = `${tableFit.fontPx}px ${quoteFontName(fFam)}`;
      let ry = rowY;
      for (const R of wRow.right) { ctx.fillText(R, x + colLeftW + colGap, ry); ry += tableFit.lineHeight; }
      rowY += wRow.rowH + Math.round(tableFit.lineHeight * 0.35);
    }
  }

  // slight helper used above (quotes font name properly)
  function quoteFontName(name) {
    if (!name) return '"Noto Sans"';
    return name.includes(' ') ? `"${name}"` : name;
  }

  // ---------------- rendering helpers ----------------
  async function renderPreviews() {
    // wait for fonts
    try { if (typeof document !== 'undefined' && document.fonts && document.fonts.ready) await document.fonts.ready; } catch (e) {}
    const opts = { bgA, bgB, textColor, fontFamily, logoImg: logoImgRef.current, text };
    for (const p of PRESETS) {
      const canvas = canvasRefs.current[p.key];
      if (!canvas) continue;
      try { await drawOne(canvas, p.w, p.h, opts); } catch (e) { /* draw error */ }
    }
  }

  async function downloadOne(preset) {
    const off = document.createElement('canvas');
    const opts = { bgA, bgB, textColor, fontFamily, logoImg: logoImgRef.current, text };
    await drawOne(off, preset.w, preset.h, opts);
    const url = off.toDataURL('image/png');
    const a = document.createElement('a'); a.href = url; a.download = preset.filename; a.click();
  }

  async function downloadAll() {
    for (const p of PRESETS) {
      await downloadOne(p);
    }
  }

  // file input handler
  function handleLogoFile(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return setLogoDataUrl(null);
    const reader = new FileReader();
    reader.onload = () => setLogoDataUrl(String(reader.result));
    reader.readAsDataURL(file);
  }

  // initial render on mount
  useEffect(() => { renderPreviews(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  // ---------------- UI ----------------
  return (
    <div style={{ padding: 20, fontFamily: 'Noto Sans, system-ui, sans-serif', color: '#fff', background: '#0b0b10', minHeight: '100vh' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr', gap: 20 }}>
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
          <div style={{ width: 380, background: '#111216', padding: 16, borderRadius: 16, border: '1px solid #2a2a30' }}>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Job Post Image Generator</h2>
            <p style={{ color: '#a1a1aa', marginTop: 8, marginBottom: 12, fontSize: 13 }}>Line1 = heading · Line2 = subheading · Remaining lines become table rows (label/value)</p>
            <textarea value={text} onChange={(e) => setText(e.target.value)} style={{ width: '100%', height: 180, padding: 10, borderRadius: 10, background: '#0e0f13', color: '#fff', border: '1px solid #2a2a30' }} />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 12 }}>
              <div>
                <label style={{ fontSize: 12, color: '#a1a1aa' }}>Gradient Start</label>
                <input type="color" value={bgA} onChange={(e) => setBgA(e.target.value)} style={{ width: '100%', height: 40, borderRadius: 8, border: '1px solid #2a2a30' }} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: '#a1a1aa' }}>Gradient End</label>
                <input type="color" value={bgB} onChange={(e) => setBgB(e.target.value)} style={{ width: '100%', height: 40, borderRadius: 8, border: '1px solid #2a2a30' }} />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
              <div>
                <label style={{ fontSize: 12, color: '#a1a1aa' }}>Text Color</label>
                <input type="color" value={textColor} onChange={(e) => setTextColor(e.target.value)} style={{ width: '100%', height: 40, borderRadius: 8, border: '1px solid #2a2a30' }} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: '#a1a1aa' }}>Font</label>
                <select value={fontFamily} onChange={(e) => setFontFamily(e.target.value)} style={{ width: '100%', height: 40, borderRadius: 8, background: '#0e0f13', color: '#fff', border: '1px solid #2a2a30' }}>
                  <option value={'Noto Sans'}>Noto Sans (Unicode)</option>
                  <option value={'system-ui'}>System UI</option>
                </select>
              </div>
            </div>

            <div style={{ marginTop: 10 }}>
              <label style={{ fontSize: 12, color: '#a1a1aa' }}>Upload Logo (optional)</label>
              <input type="file" accept="image/*" onChange={handleLogoFile} style={{ width: '100%', marginTop: 6 }} />
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button onClick={downloadAll} style={{ padding: '10px 14px', borderRadius: 10, background: '#fff', color: '#000', fontWeight: 700, border: '1px solid #2a2a30' }}>Download All</button>
              <button onClick={() => { setLogoDataUrl(null); logoImgRef.current = null; setTimeout(()=>renderPreviews(),0); }} style={{ padding: '10px 14px', borderRadius: 10, background: '#181a20', color: '#fff', border: '1px solid #2a2a30' }}>Remove Logo</button>
            </div>
          </div>

          <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {PRESETS.map((p) => (
              <div key={p.key} style={{ background: '#111216', border: '1px solid #2a2a30', borderRadius: 14, padding: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#a1a1aa', marginBottom: 8 }}>
                  <div style={{ fontSize: 13 }}>{p.name}</div>
                  <div style={{ fontSize: 12 }}>{p.w}×{p.h}</div>
                </div>
                <div style={{ borderRadius: 10, overflow: 'hidden', background: '#000' }}>
                  <canvas ref={(el) => (canvasRefs.current[p.key] = el)} style={{ width: '100%', height: 'auto', display: 'block' }} />
                </div>
                <div style={{ marginTop: 10 }}>
                  <button onClick={() => downloadOne(p)} style={{ width: '100%', padding: '10px 12px', borderRadius: 10, background: '#181a20', color: '#fff', border: '1px solid #2a2a30' }}>Download</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
