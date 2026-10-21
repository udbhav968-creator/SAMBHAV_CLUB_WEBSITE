## What changed

## Checks
- [ ] `npm run lint && npm run typecheck && npm test` pass locally
- [ ] Schema change? Migration generated with `npm run db:generate` and committed
- [ ] Touches Vihaan (prompt, tools, model, router)? `npm run eval:intent` passes; new prompt added as a **new version** in `PROMPTS`; failing production cases added to `evals/datasets`
- [ ] Security-relevant? Updated `SECURITY.md` / `docs/THREAT_MODEL.md`
- [ ] No secrets, phone numbers or personal data committed
