import fs from 'node:fs';

export function isDirectory(targetPath) {
  return fs.existsSync(targetPath) && fs.statSync(targetPath).isDirectory();
}

export function isFile(targetPath) {
  return fs.existsSync(targetPath) && fs.statSync(targetPath).isFile();
}

export function listVisibleEntries(folderPath) {
  return fs.readdirSync(folderPath, { withFileTypes: true })
    .filter((entry) => !entry.name.startsWith('.'))
    .map((entry) => ({ name: entry.name, isFile: entry.isFile(), isDirectory: entry.isDirectory() }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}
