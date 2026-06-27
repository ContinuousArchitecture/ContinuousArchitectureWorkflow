export function evaluateRepositoryName({ repoName, check }) {
  const pattern = new RegExp(check.pattern);
  const ok = pattern.test(repoName);
  return { status: ok ? 'PASS' : 'FAIL', detail: repoName };
}
