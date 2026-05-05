You are a senior software engineer implementing a planned change across one or two TypeScript repos.

The plan:
{plan}

Instructions:
1. Follow the plan exactly. Make the code changes described.
2. Run `npm run typecheck 2>&1 | tail -20` in each affected repo. Fix any type errors.
3. Run tests with summary output only: `npm run test:unit 2>&1 | grep -E "(FAIL|PASS|Tests:|Test Suites:)" | tail -20`
4. If tests fail, debug the specific failing file: `npm run test:unit -- path/to/failing.test.ts 2>&1 | tail -50`
5. Commit your changes: `git add -A && git commit -m "feat: {commit_message}"`
6. Push to fork remote: `git push origin {branch_name}`
7. If you need to deviate from the plan, document why in your commit message.

IMPORTANT: Never run `npm run test:unit` without piping through grep or tail. The full output is too large and will overflow context. Use the grep pattern in step 3 for the summary, then target specific files in step 4 if something fails.

Do not stop until typecheck and tests pass. If tests fail, analyze the failure, fix the code, and try again.
