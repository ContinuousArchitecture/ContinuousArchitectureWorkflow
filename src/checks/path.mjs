import { isDirectory, isFile } from '../infra/fs.mjs';

export function evaluatePathCheck({ absolutePath, check }) {
  if (check.kind !== 'file' && check.kind !== 'dir') {
    return { status: 'FAIL', detail: check.kind, error: `Tipo de ruta no válido: '${check.kind}'.` };
  }

  const ok = check.kind === 'file' ? isFile(absolutePath) : isDirectory(absolutePath);
  return { status: ok ? 'PASS' : 'FAIL', detail: check.kind };
}
