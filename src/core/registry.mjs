import { evaluateFileNotEmptyCheck } from '../checks/file-not-empty.mjs';
import { evaluatePathCheck } from '../checks/path.mjs';
import { evaluateRepositoryName } from '../checks/repository-name.mjs';
import { evaluateSingleVisibleFileCheck } from '../checks/single-visible-file.mjs';
import { evaluateTextContainsCheck } from '../checks/text-contains.mjs';
import { evaluateXmlNameNotContainsCheck } from '../checks/xml-name-not-contains.mjs';
import { evaluateXmlNameRegexCheck } from '../checks/xml-name-regex.mjs';
import { evaluateXmlRootCheck } from '../checks/xml-root.mjs';

export const CHECK_HANDLERS = {
  'repository-name': evaluateRepositoryName,
  path: evaluatePathCheck,
  'single-visible-file': evaluateSingleVisibleFileCheck,
  'file-not-empty': evaluateFileNotEmptyCheck,
  'xml-root': evaluateXmlRootCheck,
  'text-contains': evaluateTextContainsCheck,
  'xml-name-regex': evaluateXmlNameRegexCheck,
  'xml-name-not-contains': evaluateXmlNameNotContainsCheck,
};
