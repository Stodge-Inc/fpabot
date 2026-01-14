# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## AI Working Agreement (applies to this repo)

**Goal:** Make small, correct, reviewable changes that preserve product behavior unless explicitly asked to change it.

### Operating rules
- Prefer **small diffs** and incremental edits over refactors.
- **Do not guess.** If requirements, data meaning, or expected behavior are unclear, ask a short question or propose 2–3 options with tradeoffs.
- Treat the existing code as the source of truth. Don't "improve" style/structure unless it directly supports the task.

### Correctness & safety
- Never fabricate: numbers, API responses, DB fields, env vars, file paths, commands, or tool outputs.
- If something depends on real data (finance, billing, customer-facing logic), be explicit about assumptions and verify via code/tests.
- **No secrets, ever:** don't print or request credentials, tokens, private keys, or customer data. Don't add secrets to code, logs, docs, or examples.
- Minimize data exposure in logs: avoid dumping full payloads/rows; prefer IDs + counts + redacted samples.

### Schema & contracts
- Treat **schema/contracts as SSOT**: DB schema, shared types, and API contracts must stay consistent.
- If you change a contract (schema/type/API), also update:
  - callers/consumers
  - migrations (if applicable)
  - tests/fixtures
  - documentation or inline comments where behavior is defined

### Tests & verification
- Changes must include verification:
  - update/add tests when behavior changes or bug is fixed
  - keep fixtures/golden files in sync with parsing/extraction logic
- Before declaring "done," run the repo's standard checks (tests/lint/typecheck/build) and report what you ran and the result.
  - If you can't run commands here, state exactly what should be run locally/CI.

### Implementation preferences
- Keep changes localized: touch the fewest files needed.
- Avoid "drive-by" cleanup (formatting, renames, dependency bumps) unless requested.
- Don't introduce new dependencies without a clear need and footprint rationale.

### PR-quality output
- Summarize changes like a good PR:
  - What changed (behavior + code)
  - Why it changed
  - Risks/edge cases
  - How it was tested
  - Any follow-ups or TODOs

---

## Goal of Claude in this repo

Make small, safe diffs. Prefer incremental changes. Don't refactor without a reason.

This bot answers financial questions in Slack for a ~$100M ARR company. A wrong number here can mislead executives, cause bad decisions, or erode trust in data. **When uncertain, ask a clarifying question instead of guessing.**

## Non-negotiables

- **Never fabricate numbers.** If data is missing, say exactly what tab/column/period is missing. Don't extrapolate or estimate unless explicitly asked.
- **Always state the scenario and time window.** Every financial answer must specify: Actuals vs Budget, and which period (e.g., "2025 Actuals, Q3").
- **Year interpretation is strict:**
  - **2025** = 2025 Actuals (closed year, actual data)
  - **2026+** = Budget data
  - "2026 vs 2025" means 2026 Budget vs 2025 Actuals
  - Prior year comparisons always use Actuals, not Budget
- **Don't guess at ambiguous questions.** If a question could mean multiple things (e.g., "revenue" could be Net Revenue, Gross Revenue, or ARR), ask for clarification.
- **Rate limits exist for a reason.** The 15-iteration tool loop cap prevents runaway queries. Don't increase it.

## Response correctness rules

**Before answering any financial question:**
1. Verify the tool results match what was asked. If they don't, query again or ask for clarification.
2. Cross-check account names—"Marketing" vs "Sales & Marketing" vs "S&M" may be different line items.
3. Confirm you have the right scenario (Actuals/Budget) and period (month/quarter/year).

**Data lookup hierarchy:**
1. **Metrics tab** - For KPIs (Net Revenue, EBITDA, Gross Profit)
2. **BvA Income Statement** - For P&L line items with Budget vs Actuals
3. **Account-level queries** - For detailed breakdowns within departments

**If tool results seem wrong:**
- Don't force an answer. Say: "I found [X] but expected [Y] based on your question. Can you clarify?"
- Check if you queried the wrong tab, scenario, or time period.

## Sensitive data / Slack hygiene

- **Don't dump raw sheet rows.** Summarize data into readable insights. Tables are fine; CSV dumps are not.
- **Never post anything that looks like:**
  - Credentials, API keys, or tokens
  - Google Sheet IDs or private URLs
  - Internal employee names tied to compensation data
- **Large datasets:** If results exceed ~20 rows, summarize or offer to break down by category.
- **Error messages:** Don't expose stack traces or internal errors in Slack. Log them, respond with a user-friendly message.

## Tool-loop guidance

**Max 15 iterations, but prefer 2–5.**

- If you're past 5 iterations, stop and reframe the query.
- Common causes of looping:
  - Querying the wrong tab (use `explore_financial_data` first if unsure)
  - Looking for an account name that doesn't exist exactly as spelled
  - Mixing up Actuals vs Budget scenario filters
- **Before iteration 6:** Step back, summarize what you've found, and either answer with partial data or ask a clarifying question.

## Chart generation constraints

**Only generate a chart after confirming:**
1. The queried dataset is correct (right scenario, period, accounts)
2. You have enough data points to make a meaningful visualization
3. The user actually wants a chart (don't auto-chart everything)

**Chart labeling requirements:**
- X-axis: Always label with time period (e.g., "Month", "Quarter 2025")
- Y-axis: Include units (e.g., "Revenue ($M)", "Headcount")
- Title: Include scenario (e.g., "Net Revenue: 2025 Actuals vs 2026 Budget")
- Legend: Clearly distinguish Actuals from Budget lines

**Chart types:**
- Time series → Line chart
- Comparisons across categories → Bar chart
- Part-to-whole → Stacked bar (not pie charts)

## Fallback policy

When Anthropic returns 529 (overloaded), the system falls back to OpenAI.

**Fallback rules:**
- Same system prompt must be used. Don't change the financial interpretation rules.
- Same tool contract must be honored. Tool names, parameters, and expected outputs don't change.
- Response style must be consistent. Users shouldn't notice the switch.
- If fallback also fails, respond with: "I'm having trouble accessing the data right now. Please try again in a few minutes."

## Definition of done

1. **Tests pass:** `npm test` (if applicable)
2. **If you changed the system prompt:** Test with 5+ real financial questions, verify answers include scenario/period
3. **If you changed tool logic:** Verify with edge cases (missing data, wrong scenario, multi-year queries)
4. **If you changed chart generation:** Verify axes are labeled correctly with scenario/period
5. **Manual Slack test:** Ask a question in the test channel, confirm response is accurate and well-formatted

## Local dev quickstart

```bash
npm install
cp .env.example .env  # Fill in credentials
npm run dev           # Starts with --watch for auto-reload
```

Minimum env vars: `SLACK_BOT_TOKEN`, `SLACK_APP_TOKEN`, `ANTHROPIC_API_KEY`, `GOOGLE_*` credentials.

For testing without Slack: The tool functions can be called directly in Node REPL.

## Codebase conventions

**Folder structure:**
- `financial-analyst/` - Core analysis logic
  - `config.js` - System prompt and tool definitions (**read this first**)
  - `tools/` - Tool implementations (sheets, charts, variance analysis)
- `app.js` - Slack event handling

**Patterns to follow:**
- All financial queries go through the tool-use loop in `index.js`
- Sheet data is cached; use existing caching logic for new data sources
- Log with structured context: `console.log({ event: 'query', tab, scenario, period })`

**Patterns to avoid:**
- Don't add new tools without updating the system prompt to explain when to use them
- Don't query sheets outside the established tool functions
- Don't hardcode account names—they change; use exploration tools first

## PR / commit expectations

**Commit messages:**
```
<type>: <short description>

- What changed
- Why it changed
- Any risks to financial accuracy
```

**PR risk checklist:**
- [ ] Changes system prompt (affects all financial interpretations)
- [ ] Changes tool definitions (affects what data can be queried)
- [ ] Changes year/scenario interpretation logic
- [ ] Adds new data source or tab
- [ ] Changes chart labeling or formatting

**High-risk changes (require extra review):**
- Anything in `config.js` (system prompt, tool definitions)
- Year interpretation logic
- Scenario filtering (Actuals vs Budget)
- Changes that could cause wrong numbers to be returned confidently
