'use strict';
/*
 * Builds the store zips from the last commit (uncommitted edits are left out):
 *   true-shuffle-for-youtube-vX.Y.Z.zip          Chrome Web Store and Edge Add-ons
 *   true-shuffle-for-youtube-firefox-vX.Y.Z.zip  Firefox Add-ons (AMO)
 * Run it anywhere inside the repo: node store/pack.js [output folder, default: the repo root]
 */
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' });
const root = git('rev-parse', '--show-toplevel').trim();
const out = path.resolve(process.argv[2] || root);
const shipped = ['icons', 'options', 'popup', 'src']; // everything the extension needs besides manifest.json
const manifest = JSON.parse(git('-C', root, 'show', 'HEAD:manifest.json'));
const zip = (suffix) => path.join(out, `true-shuffle-for-youtube${suffix}-v${manifest.version}.zip`);

git('-C', root, 'archive', '--format=zip', '-o', zip('-firefox'), 'HEAD', 'manifest.json', ...shipped);

// Chrome and Edge get the manifest without Firefox's keys: Edge's store rejects background.scripts,
// and Chrome before 121 refuses to load it.
delete manifest.background.scripts;
delete manifest.browser_specific_settings;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'true-shuffle-'));
try {
  const chromium = path.join(tmp, 'manifest.json');
  fs.writeFileSync(chromium, JSON.stringify(manifest, null, 2) + '\n');
  git('-C', root, 'archive', '--format=zip', '-o', zip(''), `--add-file=${chromium}`, 'HEAD', ...shipped);
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
console.log(zip(''));
console.log(zip('-firefox'));
