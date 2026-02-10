#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// ─── Configuration ───────────────────────────────────────────────────────────

const PROJECT_ROOT = __dirname;
const INPUT_DIR = path.join(PROJECT_ROOT, 'input');
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'output');
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MODEL = 'nano-banana-pro-preview';
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`;

// Rate limiting: Nano Banana Pro has limits, so we add delays between requests
const DELAY_BETWEEN_REQUESTS_MS = 3000;

// ─── CSV Parser (same as generate.js) ───────────────────────────────────────

function parseCSV(csvText) {
  const allRows = [];
  let fields = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < csvText.length; i++) {
    const c = csvText[i];
    if (inQuotes) {
      if (c === '"') {
        if (csvText[i + 1] === '"') { field += '"'; i++; }
        else { inQuotes = false; }
      } else { field += c; }
    } else {
      if (c === '"') { inQuotes = true; }
      else if (c === ',') { fields.push(field); field = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && csvText[i + 1] === '\n') i++;
        fields.push(field);
        if (fields.some(f => f.trim())) allRows.push(fields);
        fields = []; field = '';
      } else { field += c; }
    }
  }
  fields.push(field);
  if (fields.some(f => f.trim())) allRows.push(fields);

  const headers = allRows[0].map(h => h.trim());
  const rows = [];
  for (let i = 1; i < allRows.length; i++) {
    const row = {};
    headers.forEach((h, idx) => { row[h] = (allRows[i][idx] || '').trim(); });
    rows.push(row);
  }
  return rows;
}

function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// ─── Image Generation ───────────────────────────────────────────────────────

async function generateImage(prompt, outputPath, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseModalities: ['TEXT', 'IMAGE'] }
        })
      });

      if (res.status === 429) {
        const waitTime = (attempt + 1) * 10000;
        console.log(`    ⏳ Rate limited, waiting ${waitTime / 1000}s...`);
        await sleep(waitTime);
        continue;
      }

      const data = await res.json();

      if (!data.candidates || !data.candidates[0]) {
        console.log(`    ⚠️  No candidates in response (attempt ${attempt + 1})`);
        if (attempt < retries) { await sleep(5000); continue; }
        return false;
      }

      const parts = data.candidates[0].content.parts;
      for (const part of parts) {
        if (part.inlineData) {
          const ext = part.inlineData.mimeType === 'image/png' ? '.png' : '.jpg';
          const finalPath = outputPath.replace(/\.\w+$/, ext);
          fs.writeFileSync(finalPath, Buffer.from(part.inlineData.data, 'base64'));
          return finalPath;
        }
      }

      console.log(`    ⚠️  Response had no image data (attempt ${attempt + 1})`);
      if (attempt < retries) await sleep(3000);

    } catch (err) {
      console.log(`    ❌ Error: ${err.message} (attempt ${attempt + 1})`);
      if (attempt < retries) await sleep(5000);
    }
  }
  return false;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── Image Prompts per Site ─────────────────────────────────────────────────

function getImagePrompts(row) {
  const keyword = row.primary_keyword;
  const productName = row.product_name;

  return [
    {
      name: 'hero.jpg',
      prompt: `Wide landscape hero banner photo for an e-commerce website selling ${keyword}. Modern, aspirational lifestyle photography. Clean, bright, professional. The image should evoke quality and trust. No text overlay.`
    },
    {
      name: 'product-main.jpg',
      prompt: `Professional product photography of a ${productName}. Clean white background, studio lighting, high-end e-commerce style. Sharp detail, centered composition. No text.`
    },
    {
      name: 'product-2.jpg',
      prompt: `Product photo of a ${keyword} from a different angle, showing details and build quality. Clean white background, studio lighting, e-commerce product photography. No text.`
    },
    {
      name: 'product-3.jpg',
      prompt: `Close-up detail shot of a ${keyword}, highlighting texture, materials, and craftsmanship. Clean background, macro product photography style. No text.`
    },
    {
      name: 'product-4.jpg',
      prompt: `Lifestyle photo of a ${keyword} in use in a real home setting. Natural lighting, modern interior, aspirational but realistic. No text.`
    },
    {
      name: 'product-5.jpg',
      prompt: `Product photo of a premium ${keyword} accessory or variation. Clean white background, studio lighting, e-commerce style. No text.`
    },
    {
      name: 'collection-1.jpg',
      prompt: `Collection banner image for ${keyword} products. Moody, editorial style with dramatic lighting. Shows multiple product variations artfully arranged. Vertical aspect ratio. No text.`
    },
    {
      name: 'collection-2.jpg',
      prompt: `Flat lay arrangement of ${keyword} products and accessories on a clean surface. Overhead shot, organized layout, e-commerce collection style. No text.`
    },
    {
      name: 'blog-hero.jpg',
      prompt: `Wide cinematic hero image related to ${keyword}. Editorial photography style, suitable for a blog article header. Atmospheric, high-quality, storytelling composition. No text.`
    },
  ];
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  if (!GEMINI_API_KEY) {
    console.error('Missing GEMINI_API_KEY environment variable.');
    console.error('Usage: GEMINI_API_KEY=your-key node generate-images.js');
    process.exit(1);
  }

  const args = process.argv.slice(2);
  let csvFile = path.join(INPUT_DIR, 'sites.csv');
  let filterDomain = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--csv' && args[i + 1]) csvFile = args[++i];
    else if (args[i] === '--domain' && args[i + 1]) filterDomain = args[++i];
  }

  if (!fs.existsSync(csvFile)) {
    console.error(`CSV not found: ${csvFile}`);
    process.exit(1);
  }

  console.log(`\n🎨 Nano Banana Pro Image Generator`);
  console.log(`📄 Reading CSV: ${csvFile}\n`);

  const csvText = fs.readFileSync(csvFile, 'utf-8');
  let rows = parseCSV(csvText);

  if (filterDomain) {
    rows = rows.filter(r => r.domain === filterDomain);
    if (rows.length === 0) { console.error(`No rows for domain: ${filterDomain}`); process.exit(1); }
  }

  let totalGenerated = 0;
  let totalFailed = 0;

  for (const row of rows) {
    const domainSlug = row.domain.replace(/\./g, '-');
    const imagesDir = path.join(OUTPUT_DIR, domainSlug, 'images');
    fs.mkdirSync(imagesDir, { recursive: true });

    const prompts = getImagePrompts(row);
    console.log(`\n🖼️  ${row.domain} (${prompts.length} images)`);

    for (const img of prompts) {
      const outputPath = path.join(imagesDir, img.name);

      // Skip if image already exists
      const existingFiles = fs.readdirSync(imagesDir).filter(f => f.startsWith(img.name.replace(/\.\w+$/, '')));
      if (existingFiles.length > 0) {
        console.log(`  ⏭️  ${img.name} (already exists)`);
        continue;
      }

      process.stdout.write(`  🎨 ${img.name}...`);
      const result = await generateImage(img.prompt, outputPath);

      if (result) {
        const filename = path.basename(result);
        const size = Math.round(fs.statSync(result).size / 1024);
        console.log(` ✅ ${filename} (${size}KB)`);
        totalGenerated++;
      } else {
        console.log(` ❌ failed`);
        totalFailed++;
      }

      // Rate limit delay
      await sleep(DELAY_BETWEEN_REQUESTS_MS);
    }
  }

  console.log(`\n🎉 Done! Generated ${totalGenerated} images, ${totalFailed} failed.\n`);
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
