// Fails if any commit's author or committer email is not a GitHub noreply address (the repo is public).
import { execFileSync } from 'node:child_process';

const out = execFileSync('git', ['log', '--all', '--format=%H %ae %ce'], { encoding: 'utf8' }).trim();
const bad = out.split('\n').filter(Boolean).filter((line) => {
  const [, ...emails] = line.split(' ');
  return emails.some((e) => !/@users\.noreply\.github\.com$/.test(e));
});
if (bad.length) {
  console.error('Commits with a non-noreply email (rewrite them before pushing):\n' + bad.slice(0, 10).map((l) => '  ' + l).join('\n'));
  process.exit(1);
}
console.log('commit emails ok');
