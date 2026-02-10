# Lorem Ipsum SEO Test - E-commerce Site Generator

## Project Overview
A static site generator that produces niche e-commerce websites from CSV input for SEO testing. Based on Kyle Roof's Lorem Ipsum ranking methodology — sites use placeholder content with strategic keyword placement in SEO-critical signals.

## Architecture
- **`main` branch**: Generator tooling (templates, scripts, CSV input)
- **Domain branches**: Each of the 8 exact-match domains has its own branch containing only the deployable site files. Railway deploys from each branch.

## Domains
| Domain | Branch |
|--------|--------|
| selfcleaninglitterbox.shop | selfcleaninglitterbox |
| crossbodywaterbottlebag.shop | crossbodywaterbottlebag |
| nadfacecream.shop | nadfacecream |
| arthritisjaropener.shop | arthritisjaropener |
| diytinyarcarde.shop | diytinyarcarde |
| antistripclothing.shop | antistripclothing |
| 148scalemodels.shop | 148scalemodels |
| woodendollhousekits.shop | woodendollhousekits |

## Key Commands
```bash
# Generate all sites from CSV
node generate.js

# Deploy generated sites to their GitHub branches
node deploy.js

# Generate a single site (by domain)
node generate.js --domain selfcleaninglitterbox.shop
```

## File Structure
```
templates/          # HTML templates with {{placeholder}} syntax
  _header.html      # Shared header partial
  _footer.html      # Shared footer partial
  homepage.html     # Homepage template
  collection.html   # Collection/category page template
  product.html      # Product detail page template
  blog.html         # Blog post template
input/              # CSV input files
  sites.csv         # One row per site with all page content
output/             # Generated sites (git-ignored)
generate.js         # Main generator script (zero dependencies)
deploy.js           # Pushes output to domain branches
```

## CSV Format
One row per site. Key columns: `domain`, `primary_keyword`, `brand_name`, `homepage_title`, `homepage_meta_description`, `homepage_h1`, `collection_title`, `product_name`, `product_price`, `blog1_title`, `blog1_content`, etc. See `input/example.csv` for the full schema.

## SEO Signals (auto-generated)
- Title tags, meta descriptions, H1s, canonical URLs
- JSON-LD schema (Product, Article, Organization, BreadcrumbList)
- Open Graph + Twitter Card tags
- sitemap.xml + robots.txt
- Internal content silo linking (blogs -> product, collection -> product)

## Templates
Templates use `{{placeholder}}` syntax. The generator replaces these with CSV data. Partials are included via `{{HEADER}}` and `{{FOOTER}}` markers.

## When modifying templates
- Keep Tailwind CDN approach (no build step)
- Maintain consistent header/footer across all page types
- SEO-critical elements use `{{placeholders}}` — everything else is static lorem ipsum
- Images use Google AIDA public CDN placeholders
