#!/usr/bin/env node
/**
 * Generates cards/index.json and tl/index.json.
 * Run locally with `node scripts/build-index.js`, or let the GitHub Action do it on every push.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');

function gitDate(file) {
    try {
        const out = execSync(`git log -1 --format=%cI --diff-filter=A -- "${file}"`, { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] })
            .toString().trim();
        if (out) return out;
    } catch { /* not a git repo or file untracked */ }
    return fs.statSync(path.join(ROOT, file)).mtime.toISOString();
}

function writeJson(rel, data) {
    const abs = path.join(ROOT, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, JSON.stringify(data, null, 2) + '\n');
    console.log(`wrote ${rel}`);
}

// ---- cards/index.json ---------------------------------------------------
{
    const dir = path.join(ROOT, 'cards');
    const cards = fs.existsSync(dir)
        ? fs.readdirSync(dir).filter(f => f.endsWith('.json') && !f.startsWith('_') && f !== 'index.json').sort()
        : [];
    writeJson('cards/index.json', { generated: new Date().toISOString(), cards });
}

// ---- tl/index.json ------------------------------------------------------
{
    const dir = path.join(ROOT, 'tl');

    // Optional title overrides: tl/titles.json is { "filename.jar": "Nice Title", ... }
    let titles = {};
    const titlesPath = path.join(dir, 'titles.json');
    if (fs.existsSync(titlesPath)) {
        try {
            titles = JSON.parse(fs.readFileSync(titlesPath, 'utf8'));
        } catch (e) {
            console.warn(`tl/titles.json is not valid JSON, ignoring it: ${e.message}`);
        }
    }

    const files = fs.existsSync(dir)
        ? fs.readdirSync(dir)
            .filter(f => /\.(jar|jad|zip)$/i.test(f))
            .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
            .map(name => {
                const entry = {
                    name,
                    size: fs.statSync(path.join(dir, name)).size,
                    date: gitDate(`tl/${name}`),
                };
                if (titles[name]) entry.title = String(titles[name]);   // override shown title
                return entry;
            })
        : [];
    writeJson('tl/index.json', { generated: new Date().toISOString(), files });
}
