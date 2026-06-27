import path from 'node:path';

export function getArg(name, fallback = '') {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

export function resolveArgPath(name, fallback) {
  return path.resolve(getArg(name, fallback));
}
