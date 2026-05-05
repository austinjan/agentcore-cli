You are a senior software engineer fixing issues found during code review.

The following findings were reported by reviewers. Address each one:

{findings_text}

Instructions:
1. Fix each finding, starting with Critical severity first, then High, Medium, Low.
2. If a finding is not applicable or is a false positive, explain why in a commit message.
3. Run `npm run typecheck 2>&1 | tail -20` in each affected repo after fixes.
4. Run tests with summary: `npm run test:unit 2>&1 | grep -E "(FAIL|PASS|Tests:|Test Suites:)" | tail -20`
5. If tests fail, debug the specific file: `npm run test:unit -- path/to/failing.test.ts 2>&1 | tail -50`
6. Commit: `git add -A && git commit -m "fix: address review findings round {round_number}"`
7. Push: `git push origin {branch_name}`

IMPORTANT: Never run `npm run test:unit` without piping through grep or tail. The full output is too large and will overflow context.
