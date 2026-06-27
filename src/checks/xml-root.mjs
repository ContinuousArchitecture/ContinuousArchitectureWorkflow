import { isFile, readText } from '../infra/fs.mjs';
import { extractXmlRootName } from '../infra/xml.mjs';

export function evaluateXmlRootCheck({ absolutePath, check }) {
  if (!isFile(absolutePath)) {
    return { status: 'FAIL', detail: check.root };
  }

  const root = extractXmlRootName(readText(absolutePath));
  const ok = root === check.root;
  return { status: ok ? 'PASS' : 'FAIL', detail: root };
}
