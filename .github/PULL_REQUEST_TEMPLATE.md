## What and why / ماذا ولماذا

<!-- One or two sentences. Link the issue if there is one. -->

## Checklist

- [ ] `npm test` passes (build + engine tie-out + server)
- [ ] `npm run test:e2e` passes if a screen or the server changed
- [ ] Engine changes keep the tie-out at **0 differences** (or the change is explained below)
- [ ] New behaviour has a test
- [ ] `CHANGELOG.md` updated under **Unreleased**
- [ ] No real data, `.env`, database or workbook included
- [ ] New write actions are enforced on the server too (not only hidden in the UI)

## Notes for the reviewer
