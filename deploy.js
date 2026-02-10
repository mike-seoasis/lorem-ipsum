#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// ─── Configuration ───────────────────────────────────────────────────────────

const PROJECT_ROOT = __dirname;
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'output');

// Domain to branch name mapping
const DOMAIN_BRANCHES = {
  'selfcleaninglitterbox-shop': 'selfcleaninglitterbox',
  'crossbodywaterbottlebag-shop': 'crossbodywaterbottlebag',
  'nadfacecream-shop': 'nadfacecream',
  'arthritisjaropener-shop': 'arthritisjaropener',
  'diytinyarcarde-shop': 'diytinyarcarde',
  'antistripclothing-shop': 'antistripclothing',
  '148scalemodels-shop': '148scalemodels',
  'woodendollhousekits-shop': 'woodendollhousekits',
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function run(cmd, opts = {}) {
  console.log(`  $ ${cmd}`);
  try {
    return execSync(cmd, { encoding: 'utf-8', stdio: 'pipe', ...opts });
  } catch (err) {
    if (opts.ignoreError) return '';
    throw err;
  }
}

function copyDirRecursive(src, dest) {
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// ─── Main ───────────────────────────────────────────────────────────────────

function main() {
  // Check that output directory exists
  if (!fs.existsSync(OUTPUT_DIR)) {
    console.error('No output/ directory found. Run `node generate.js` first.');
    process.exit(1);
  }

  const siteDirs = fs.readdirSync(OUTPUT_DIR).filter(d =>
    fs.statSync(path.join(OUTPUT_DIR, d)).isDirectory()
  );

  if (siteDirs.length === 0) {
    console.error('No generated sites found in output/. Run `node generate.js` first.');
    process.exit(1);
  }

  // Save current branch to return to
  const originalBranch = run('git rev-parse --abbrev-ref HEAD', { cwd: PROJECT_ROOT }).trim();
  console.log(`\n🚀 Deploying ${siteDirs.length} site(s) to GitHub branches...\n`);
  console.log(`  Current branch: ${originalBranch}\n`);

  const results = [];

  for (const siteDir of siteDirs) {
    const branchName = DOMAIN_BRANCHES[siteDir] || siteDir;
    const sitePath = path.join(OUTPUT_DIR, siteDir);

    console.log(`\n📦 Deploying ${siteDir} → branch: ${branchName}`);

    try {
      // Copy site files to a temp directory BEFORE any git operations
      // (git rm can destroy files in output/ if they were accidentally tracked)
      const tmpDir = path.join(require('os').tmpdir(), `deploy-${siteDir}-${Date.now()}`);
      copyDirRecursive(sitePath, tmpDir);

      // Check if branch exists
      const branchExists = run(`git show-ref --verify --quiet refs/heads/${branchName}`, {
        cwd: PROJECT_ROOT,
        ignoreError: true
      });

      // Check if remote branch exists
      const remoteBranchExists = run(`git ls-remote --heads origin ${branchName}`, {
        cwd: PROJECT_ROOT,
        ignoreError: true
      }).trim();

      if (remoteBranchExists || branchExists !== '') {
        // Branch exists, switch to it
        run(`git checkout ${branchName}`, { cwd: PROJECT_ROOT });
      } else {
        // Create orphan branch
        run(`git checkout --orphan ${branchName}`, { cwd: PROJECT_ROOT });
        run('git rm -rf .', { cwd: PROJECT_ROOT, ignoreError: true });
      }

      // Clean the branch (remove all tracked files)
      const tracked = run('git ls-files', { cwd: PROJECT_ROOT }).trim();
      if (tracked) {
        run('git rm -rf .', { cwd: PROJECT_ROOT, ignoreError: true });
      }

      // Also clean untracked files from root (but not .git)
      const rootFiles = fs.readdirSync(PROJECT_ROOT).filter(f => f !== '.git' && f !== 'output' && f !== 'node_modules' && f !== '.DS_Store');
      for (const f of rootFiles) {
        const fp = path.join(PROJECT_ROOT, f);
        if (fs.statSync(fp).isDirectory()) {
          fs.rmSync(fp, { recursive: true });
        } else {
          fs.unlinkSync(fp);
        }
      }

      // Copy site files from temp directory to project root
      const tmpFiles = fs.readdirSync(tmpDir);
      console.log(`  📂 Temp dir contents: ${tmpFiles.join(', ')}`);
      copyDirRecursive(tmpDir, PROJECT_ROOT);

      // Clean up temp directory
      fs.rmSync(tmpDir, { recursive: true });

      // Write .gitignore to prevent output/ and node_modules/ from being committed
      fs.writeFileSync(path.join(PROJECT_ROOT, '.gitignore'), 'output/\nnode_modules/\n.DS_Store\n');

      // Debug: list what's in PROJECT_ROOT before staging
      const rootAfterCopy = fs.readdirSync(PROJECT_ROOT).filter(f => f !== '.git');
      console.log(`  📂 Root after copy: ${rootAfterCopy.join(', ')}`);

      // Stage all files
      run('git add -A', { cwd: PROJECT_ROOT });

      // Commit
      const commitMsg = `Deploy ${siteDir} - ${new Date().toISOString()}`;
      run(`git commit -m "${commitMsg}" --allow-empty`, { cwd: PROJECT_ROOT });

      // Push
      run(`git push origin ${branchName}`, { cwd: PROJECT_ROOT });

      results.push({ siteDir, branchName, status: 'success' });
      console.log(`  ✅ Pushed to branch: ${branchName}`);

    } catch (err) {
      results.push({ siteDir, branchName, status: 'error', error: err.message });
      console.error(`  ❌ Failed: ${err.message}`);
    }
  }

  // Return to original branch
  console.log(`\n🔄 Returning to ${originalBranch} branch...`);
  try {
    run(`git checkout ${originalBranch}`, { cwd: PROJECT_ROOT });
  } catch {
    run('git checkout main', { cwd: PROJECT_ROOT });
  }

  // Summary
  console.log('\n📊 Deployment Summary:');
  console.log('  ' + '─'.repeat(60));
  console.log('  ' + 'Site'.padEnd(35) + 'Branch'.padEnd(25) + 'Status');
  console.log('  ' + '─'.repeat(60));
  for (const r of results) {
    const icon = r.status === 'success' ? '✅' : '❌';
    console.log(`  ${icon} ${r.siteDir.padEnd(33)}${r.branchName.padEnd(25)}${r.status}`);
  }
  console.log('');
}

main();
