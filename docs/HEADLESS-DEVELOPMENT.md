# Verified development attempts

`src/headless/strict.js` wraps the existing finite nine-stage harness. It requires
every adapter method, an exclusive empty attempt directory, an actual submission,
matching attempt identities, explicit passing checks backed by files, read-after
state, and a final comparison with no unresolved regressions or claims.

`src/headless/development.js` supplies a repository verification adapter. Declare
relative source files and uniquely named commands with an executable and argument
array. It hashes source before validation and submission, captures bounded process
output and exit status, stops execution after the first failure, and rejects
source changes caused by verification commands. Source edits remain explicit
agent patches between attempts. A failed attempt cannot be reused as a new run.

Run the focused proof with `node tests/headless-strict.mjs`.

These helpers execute trusted code. They are neither a security sandbox nor a
persistent planning controller. Deadlines kill the direct child process; callers
must select commands that do not leave background descendants. Evidence-file
existence does not independently certify a dishonest adapter's assertions.

Read `attempt-result.json` for the strict result. The older finite harness's
`currentStage: complete` only means its loop ended and cannot establish success.
