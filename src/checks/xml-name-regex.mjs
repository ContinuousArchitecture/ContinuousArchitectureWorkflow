import { isFile, readText } from '../infra/fs.mjs';
import { selectXmlEntries } from '../infra/xml.mjs';

export function evaluateXmlNameRegexCheck({ absolutePath, check }) {
  if (!isFile(absolutePath)) {
    return { status: 'FAIL', detail: check.selector ?? check.path };
  }

  const entries = selectXmlEntries(readText(absolutePath), check.selector);
  if (entries.length === 0) {
    return { status: 'PASS', detail: 'sin coincidencias' };
  }

  const pattern = new RegExp(check.pattern);
  const firstFailure = entries.find((entry) => !pattern.test(entry.name ?? ''));

  return {
    status: firstFailure ? 'FAIL' : 'PASS',
    detail: firstFailure ? firstFailure.name : `${entries.length} entradas`,
  };
}
