#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// ─── Configuration ───────────────────────────────────────────────────────────

const PROJECT_ROOT = __dirname;
const TEMPLATES_DIR = path.join(PROJECT_ROOT, 'templates');
const INPUT_DIR = path.join(PROJECT_ROOT, 'input');
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'output');
const DEFAULT_COLOR = '#137fec';
const TODAY = new Date().toISOString().split('T')[0];

// ─── CSV Parser (zero dependencies) ─────────────────────────────────────────

function parseCSV(csvText) {
  // Single-pass CSV parser that handles quoted fields with newlines, commas, and escaped quotes
  const allRows = [];
  let fields = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < csvText.length; i++) {
    const c = csvText[i];

    if (inQuotes) {
      if (c === '"') {
        if (csvText[i + 1] === '"') {
          // Escaped quote ""
          field += '"';
          i++;
        } else {
          // End of quoted field
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else {
      if (c === '"') {
        // Start of quoted field
        inQuotes = true;
      } else if (c === ',') {
        fields.push(field);
        field = '';
      } else if (c === '\n' || c === '\r') {
        if (c === '\r' && csvText[i + 1] === '\n') i++;
        fields.push(field);
        if (fields.some(f => f.trim())) allRows.push(fields);
        fields = [];
        field = '';
      } else {
        field += c;
      }
    }
  }
  // Last field/row
  fields.push(field);
  if (fields.some(f => f.trim())) allRows.push(fields);

  if (allRows.length < 2) {
    console.error('CSV must have at least a header row and one data row.');
    process.exit(1);
  }

  const headers = allRows[0].map(h => h.trim());
  const rows = [];
  for (let i = 1; i < allRows.length; i++) {
    const row = {};
    headers.forEach((h, idx) => {
      row[h] = (allRows[i][idx] || '').trim();
    });
    rows.push(row);
  }

  return rows;
}

// ─── Template Engine ────────────────────────────────────────────────────────

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function render(template, data) {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return data[key] !== undefined ? data[key] : match;
  });
}

function loadTemplate(name) {
  const filePath = path.join(TEMPLATES_DIR, name);
  return fs.readFileSync(filePath, 'utf-8');
}

// ─── Image Path Resolution ──────────────────────────────────────────────────

function resolveImagePaths(siteDir) {
  const imagesDir = path.join(siteDir, 'images');
  const imageMap = {
    'image_hero': 'hero',
    'image_product_main': 'product-main',
    'image_product_2': 'product-2',
    'image_product_3': 'product-3',
    'image_product_4': 'product-4',
    'image_product_5': 'product-5',
    'image_collection_1': 'collection-1',
    'image_collection_2': 'collection-2',
    'image_blog_hero': 'blog-hero',
  };

  const paths = {};
  for (const [key, name] of Object.entries(imageMap)) {
    if (fs.existsSync(imagesDir)) {
      const files = fs.readdirSync(imagesDir).filter(f => f.startsWith(name + '.'));
      if (files.length > 0) {
        paths[key] = '/images/' + files[0];
        continue;
      }
    }
    paths[key] = '/images/' + name + '.jpg';
  }

  return paths;
}

// ─── Schema Generators ──────────────────────────────────────────────────────

function generateOrganizationSchema(data) {
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Organization",
    "name": data.brand_name,
    "url": `https://${data.domain}`,
    "logo": `https://${data.domain}/logo.png`,
    "sameAs": []
  }, null, 2);
}

function generateBreadcrumbSchema(items, domain) {
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": items.map((item, i) => ({
      "@type": "ListItem",
      "position": i + 1,
      "name": item.name,
      "item": item.url ? `https://${domain}${item.url}` : undefined
    }))
  }, null, 2);
}

function generateProductSchema(data) {
  const price = data.product_price.replace(/[^0-9.]/g, '');
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Product",
    "name": data.product_name,
    "description": data.product_description,
    "brand": {
      "@type": "Brand",
      "name": data.brand_name
    },
    "offers": {
      "@type": "Offer",
      "url": `https://${data.domain}/products/${data.product_slug}.html`,
      "priceCurrency": "USD",
      "price": price,
      "availability": "https://schema.org/InStock",
      "seller": {
        "@type": "Organization",
        "name": data.brand_name
      }
    },
    "aggregateRating": {
      "@type": "AggregateRating",
      "ratingValue": "4.5",
      "reviewCount": "128"
    }
  }, null, 2);
}

function generateArticleSchema(data, blogTitle, blogSlug, blogDescription) {
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": blogTitle,
    "description": blogDescription,
    "author": {
      "@type": "Organization",
      "name": data.brand_name
    },
    "publisher": {
      "@type": "Organization",
      "name": data.brand_name,
      "logo": {
        "@type": "ImageObject",
        "url": `https://${data.domain}/logo.png`
      }
    },
    "datePublished": TODAY,
    "dateModified": TODAY,
    "mainEntityOfPage": {
      "@type": "WebPage",
      "@id": `https://${data.domain}/blog/${blogSlug}.html`
    }
  }, null, 2);
}

function generateCollectionSchema(data) {
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "name": data.collection_title,
    "description": data.collection_description || data.collection_meta_description,
    "url": `https://${data.domain}/collections/${data.collection_slug}.html`,
    "isPartOf": {
      "@type": "WebSite",
      "name": data.brand_name,
      "url": `https://${data.domain}`
    }
  }, null, 2);
}

// ─── Sitemap Generator ──────────────────────────────────────────────────────

function generateSitemap(domain, pages) {
  const urls = pages.map(p => `  <url>\n    <loc>https://${domain}${p}</loc>\n    <lastmod>${TODAY}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>${p === '/' ? '1.0' : p.includes('/products/') ? '0.9' : '0.8'}</priority>\n  </url>`);
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>`;
}

// ─── Robots.txt Generator ───────────────────────────────────────────────────

function generateRobotsTxt(domain) {
  return `User-agent: *
Allow: /

Sitemap: https://${domain}/sitemap.xml`;
}

// ─── Server.js for Railway ──────────────────────────────────────────────────

function generateServerJs() {
  return `const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files
app.use(express.static(path.join(__dirname)));

// Handle clean URLs (optional)
app.get('*', (req, res) => {
  const filePath = path.join(__dirname, req.path);
  if (require('fs').existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    res.status(404).sendFile(path.join(__dirname, 'index.html'));
  }
});

app.listen(PORT, () => {
  console.log(\`Server running on port \${PORT}\`);
});`;
}

function generatePackageJson(domainSlug) {
  return JSON.stringify({
    "name": domainSlug,
    "version": "1.0.0",
    "scripts": {
      "start": "node server.js"
    },
    "dependencies": {
      "express": "^4.18.0"
    }
  }, null, 2);
}

// ─── Related Articles HTML Generator ────────────────────────────────────────

function generateRelatedArticlesHTML(blogs, currentSlug, blogImagePath) {
  return blogs
    .filter(b => b.slug !== currentSlug)
    .map(b => `<article class="group">
<a class="block" href="/blog/${b.slug}.html">
<div class="aspect-video rounded-lg overflow-hidden mb-3">
<img alt="${b.title}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" src="${blogImagePath}"/>
</div>
<h5 class="font-bold text-slate-900 dark:text-white group-hover:text-primary transition-colors leading-snug">${b.title}</h5>
<p class="text-xs text-slate-400 mt-2">5 min read</p>
</a>
</article>`).join('\n');
}

// ─── Product Features HTML Generator ────────────────────────────────────────

function generateFeaturesHTML(featuresStr) {
  if (!featuresStr) return '';
  const features = featuresStr.split('|').map(f => f.trim()).filter(Boolean);
  if (features.length === 0) return '';
  return `<ul class="list-disc pl-4 space-y-1">\n${features.map(f => `  <li>${f}</li>`).join('\n')}\n</ul>`;
}

// ─── Main Generator ─────────────────────────────────────────────────────────

function generateSite(row) {
  // Compute derived fields
  const data = { ...row };
  data.primary_color = data.primary_color || DEFAULT_COLOR;
  data.collection_slug = slugify(data.collection_title || data.primary_keyword);
  data.product_slug = slugify(data.product_name || data.primary_keyword);
  data.blog1_slug = slugify(data.blog1_title || 'blog-post-1');
  data.blog2_slug = slugify(data.blog2_title || 'blog-post-2');
  data.blog3_slug = slugify(data.blog3_title || 'blog-post-3');
  data.brand_initial = (data.brand_name || 'S')[0].toUpperCase();
  data.blog_date = TODAY;

  // Original price HTML
  if (data.product_original_price) {
    data.product_original_price_html = `<p class="text-lg text-slate-400 line-through">${data.product_original_price}</p>
<span class="bg-primary/10 text-primary text-xs font-bold px-2 py-1 rounded">SALE</span>`;
  } else {
    data.product_original_price_html = '';
  }

  // Product features HTML
  data.product_features_html = generateFeaturesHTML(data.product_features);

  // Schema JSON
  data.homepage_schema = generateOrganizationSchema(data);
  data.collection_schema = generateCollectionSchema(data);
  data.product_schema = generateProductSchema(data);

  // Blog data array for cross-referencing
  const blogs = [
    { slug: data.blog1_slug, title: data.blog1_title, meta: data.blog1_meta_description, content: data.blog1_content },
    { slug: data.blog2_slug, title: data.blog2_title, meta: data.blog2_meta_description, content: data.blog2_content },
    { slug: data.blog3_slug, title: data.blog3_title, meta: data.blog3_meta_description, content: data.blog3_content },
  ];

  // Load templates
  const headerTpl = loadTemplate('_header.html');
  const footerTpl = loadTemplate('_footer.html');
  const homepageTpl = loadTemplate('homepage.html');
  const collectionTpl = loadTemplate('collection.html');
  const productTpl = loadTemplate('product.html');
  const blogTpl = loadTemplate('blog.html');

  // Render header/footer with data
  const headerHTML = render(headerTpl, data);
  const footerHTML = render(footerTpl, data);

  // Inject header/footer into data for page-level rendering
  data.HEADER = headerHTML;
  data.FOOTER = footerHTML;

  // Output directory
  const domainSlug = data.domain.replace(/\./g, '-');
  const siteDir = path.join(OUTPUT_DIR, domainSlug);

  // Create directories
  fs.mkdirSync(path.join(siteDir, 'collections'), { recursive: true });
  fs.mkdirSync(path.join(siteDir, 'products'), { recursive: true });
  fs.mkdirSync(path.join(siteDir, 'blog'), { recursive: true });

  // Resolve image paths (detects .jpg/.png from generate-images.js output)
  const imagePaths = resolveImagePaths(siteDir);
  Object.assign(data, imagePaths);

  // ─── Generate Homepage ───────────────────────────────────────────
  const homepageHTML = render(homepageTpl, data);
  fs.writeFileSync(path.join(siteDir, 'index.html'), homepageHTML);

  // ─── Generate Collection Page ────────────────────────────────────
  const collectionHTML = render(collectionTpl, data);
  fs.writeFileSync(path.join(siteDir, 'collections', `${data.collection_slug}.html`), collectionHTML);

  // ─── Generate Product Page ───────────────────────────────────────
  const productHTML = render(productTpl, data);
  fs.writeFileSync(path.join(siteDir, 'products', `${data.product_slug}.html`), productHTML);

  // ─── Generate Blog Posts ─────────────────────────────────────────
  for (const blog of blogs) {
    if (!blog.title) continue;

    const blogData = { ...data };
    blogData.blog_title = blog.title;
    blogData.blog_slug = blog.slug;
    blogData.blog_meta_description = blog.meta;
    blogData.blog_content = blog.content;
    blogData.blog_schema = generateArticleSchema(data, blog.title, blog.slug, blog.meta);
    blogData.sidebar_related_articles = generateRelatedArticlesHTML(blogs, blog.slug, data.image_blog_hero);

    const blogHTML = render(blogTpl, blogData);
    fs.writeFileSync(path.join(siteDir, 'blog', `${blog.slug}.html`), blogHTML);
  }

  // ─── Generate Sitemap ────────────────────────────────────────────
  const pages = [
    '/',
    `/collections/${data.collection_slug}.html`,
    `/products/${data.product_slug}.html`,
    ...blogs.filter(b => b.title).map(b => `/blog/${b.slug}.html`),
  ];
  fs.writeFileSync(path.join(siteDir, 'sitemap.xml'), generateSitemap(data.domain, pages));

  // ─── Generate robots.txt ─────────────────────────────────────────
  fs.writeFileSync(path.join(siteDir, 'robots.txt'), generateRobotsTxt(data.domain));

  // ─── Generate Railway deployment files ───────────────────────────
  fs.writeFileSync(path.join(siteDir, 'server.js'), generateServerJs());
  fs.writeFileSync(path.join(siteDir, 'package.json'), generatePackageJson(domainSlug));

  return {
    domain: data.domain,
    domainSlug,
    pages: pages.length,
    siteDir,
  };
}

// ─── CLI Entry Point ────────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);
  let csvFile = path.join(INPUT_DIR, 'sites.csv');
  let filterDomain = null;

  // Parse args
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--csv' && args[i + 1]) {
      csvFile = args[++i];
    } else if (args[i] === '--domain' && args[i + 1]) {
      filterDomain = args[++i];
    }
  }

  if (!fs.existsSync(csvFile)) {
    console.error(`CSV file not found: ${csvFile}`);
    console.error('Usage: node generate.js [--csv path/to/sites.csv] [--domain example.com]');
    process.exit(1);
  }

  console.log(`\n📄 Reading CSV: ${csvFile}`);
  const csvText = fs.readFileSync(csvFile, 'utf-8');
  let rows = parseCSV(csvText);

  if (filterDomain) {
    rows = rows.filter(r => r.domain === filterDomain);
    if (rows.length === 0) {
      console.error(`No rows found for domain: ${filterDomain}`);
      process.exit(1);
    }
  }

  console.log(`📦 Generating ${rows.length} site(s)...\n`);

  const results = [];
  for (const row of rows) {
    try {
      const result = generateSite(row);
      results.push(result);
      console.log(`  ✅ ${result.domain} → ${result.siteDir} (${result.pages} pages)`);
    } catch (err) {
      console.error(`  ❌ ${row.domain || 'unknown'}: ${err.message}`);
    }
  }

  console.log(`\n🎉 Done! Generated ${results.length} site(s) in ${OUTPUT_DIR}\n`);

  // Print summary table
  console.log('  Domain'.padEnd(42) + 'Pages'.padEnd(8) + 'Output');
  console.log('  ' + '─'.repeat(70));
  for (const r of results) {
    console.log(`  ${r.domain.padEnd(40)}${String(r.pages).padEnd(8)}${r.domainSlug}/`);
  }
  console.log('');
}

main();
