import { isDirectory, listVisibleEntries } from '../infra/fs.mjs';

export function evaluateSingleVisibleFileCheck({ absolutePath, check }) {
  let ok = false;

  if (isDirectory(absolutePath)) {
    const entries = listVisibleEntries(absolutePath);
    ok = entries.length === 1 && entries[0].name === check.name && entries[0].isFile && !entries[0].isDirectory;
  }

  return { status: ok ? 'PASS' : 'FAIL', detail: check.name };
}
