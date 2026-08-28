// Behavior check for the inline script in ../.github/workflows/pr-triage.yml.
//
// The script lives inside YAML and cannot be imported, so it is lifted out by
// dedenting the `script: |` block. Deliberately no YAML parser: this file
// should stay runnable with nothing installed.
//
//   node scripts/test-pr-triage.mjs
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const workflow = readFileSync(
  join(here, '..', '.github', 'workflows', 'pr-triage.yml'),
  'utf8',
).split('\n');

const start = workflow.findIndex((line) => line.trimEnd().endsWith('script: |'));
assert.notEqual(start, -1, 'no `script: |` block found in the workflow');
const indent = workflow[start + 1].match(/^ */)[0];
const body = [];
for (const line of workflow.slice(start + 1)) {
  if (line.trim() !== '' && !line.startsWith(indent)) break;
  body.push(line.slice(indent.length));
}
const src = body.join('\n');

// Runs the workflow script against fakes and reports the label mutations.
async function run({ user, association, commits = [], labels = [], maintainers = [] }) {
  const added = [], removed = [];
  const github = {
    paginate: async (_fn, _o) => commits.map((m) => ({ commit: { message: m } })),
    rest: {
      pulls: { listCommits: 'listCommits' },
      teams: {
        getMembershipForUserInOrg: async ({ username }) => {
          if (maintainers.includes(username)) return { data: { state: 'active' } };
          const e = new Error('Not Found'); e.status = 404; throw e;
        },
      },
      issues: {
        addLabels: async ({ labels }) => added.push(...labels),
        removeLabel: async ({ name }) => removed.push(name),
      },
    },
  };
  const context = {
    repo: { owner: 'suiflex', repo: 'rdb' },
    payload: {
      pull_request: {
        number: 1, user, author_association: association,
        labels: labels.map((name) => ({ name })),
      },
    },
  };
  const core = { info: () => {} };
  await new Function('github', 'context', 'core', `return (async () => {${src}})()`)(github, context, core);
  return { added: added.sort(), removed: removed.sort() };
}

const human = { login: 'someone', type: 'User' };

// A bot PR gets exactly one label and no commit noise.
assert.deepEqual(
  await run({ user: { login: 'release-please[bot]', type: 'Bot' },
              association: 'NONE', commits: ['feat: x', 'chore: y'] }),
  { added: ['bot'], removed: [] });

// Mixed commits produce one label per type, plus the parse warning.
assert.deepEqual(
  await run({ user: { login: 'mulhamna', type: 'User' }, association: 'OWNER',
              commits: ['feat: a', 'docs: b', 'wip'], maintainers: ['mulhamna'] }),
  { added: ['commit: docs', 'commit: feat', 'maintainer', 'needs: conventional commit'],
    removed: [] });

// The GitHub bug: a first-timer arrives as 'NONE', not FIRST_TIME_CONTRIBUTOR.
assert.deepEqual(
  await run({ user: human, association: 'NONE', commits: ['fix: z'] }),
  { added: ['commit: fix', 'first contribution'], removed: [] });

// An org member who is not on the maintainers team is not a maintainer,
// and is not a newcomer either.
assert.deepEqual(
  await run({ user: { login: 'Manan-byte', type: 'User' }, association: 'MEMBER',
              commits: ['fix: z'], maintainers: ['mulhamna'] }),
  { added: ['commit: fix'], removed: [] });

// Reconciliation: fixing the bad commit drops the warning and adds the type,
// while hand-applied labels survive untouched.
assert.deepEqual(
  await run({ user: human, association: 'CONTRIBUTOR', commits: ['chore: z'],
              labels: ['needs: conventional commit', 'commit: feat', 'enhancement', 'driver'] }),
  { added: ['commit: chore'],
    removed: ['commit: feat', 'needs: conventional commit'] });

// 'style' and 'revert' parse cleanly but have no label of their own.
assert.deepEqual(
  await run({ user: human, association: 'CONTRIBUTOR', commits: ['style: tidy', 'revert: "feat: x"'] }),
  { added: [], removed: [] });

// Scopes and breaking-change markers still parse.
assert.deepEqual(
  await run({ user: human, association: 'CONTRIBUTOR', commits: ['feat(driver)!: rework'] }),
  { added: ['commit: feat'], removed: [] });

// A non-404 failure must surface, never be read as "not a maintainer".
await assert.rejects(run({
  user: human, association: 'NONE', commits: ['fix: z'],
  maintainers: { includes() { const e = new Error('boom'); e.status = 500; throw e; } },
}));

console.log('all 8 checks passed');
