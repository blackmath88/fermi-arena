// Baut dist/fermi-arena.html: eine einzige Datei ohne Abhängigkeiten (für Artifact, Mail, Offline).
// Vorgehen: Module in Abhängigkeitsreihenfolge verketten, import-Zeilen entfernen, export-Schlüsselwörter entfernen.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const ORDER = ['src/units.js', 'src/tree.js', 'data/problems.js', 'src/judge.js', 'src/tiers.js', 'src/profile.js', 'src/app.js'];

const js = ORDER.map(f => `// ---- ${f} ----\n` + readFileSync(f, 'utf8')
  .split('\n').filter(l => !/^import\s/.test(l)).join('\n')
  .replace(/^export (async function|function|const|let)/gm, '$1')).join('\n');

const html = readFileSync('index.html', 'utf8')
  .replace('<script type="module" src="src/app.js"></script>', () => `<script type="module">\n${js}\n</script>`);

mkdirSync('dist', { recursive: true });
writeFileSync('dist/fermi-arena.html', html);
console.log(`dist/fermi-arena.html (${(html.length / 1024).toFixed(1)} KB)`);
