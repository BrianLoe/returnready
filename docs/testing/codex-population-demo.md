# ReturnReady Codex population demo

## Story

The user has scattered synthetic evidence: a WFH worksheet, a foreign-broker statement, and a crypto export. They attach those files to Codex. Codex interprets them outside ReturnReady and calls narrow WebMCP tools to populate the same sparse FY2025–26 draft a person can fill manually.

ReturnReady receives only structured facts and display-safe source labels. It never uploads or parses files, calculates tax, or lodges a return.

## Under-three-minute flow

1. Open the empty draft and show the small prefilled PAYG context.
2. Attach the three files in `demo-evidence/` to Codex.
3. Ask: “Populate my FY2025–26 ReturnReady draft from these synthetic files.”
4. Show the WFH deduction appearing with documentary provenance, 40 recorded hours, the 70-cent fixed-rate formula, and the domain-derived $28.00 amount. Then show MSFT, AAPL, and BTC disposal facts—including proceeds and costs—appearing with Agent audit entries.
5. Ask Codex what blocks the review pack. It should identify the missing AAPL acquisition details without inventing them.
6. Supply the historical acquisition date, unit price, and currency. This is recorded as user-attested.
7. Generate the review pack. Point out the visible crypto-fee warning, the calculated WFH amount, and the no-lodgement disclaimer. Do not calculate or claim a capital gain or loss.
8. Reset the demo.

## Local rehearsal

Automated manual-flow rehearsal is covered by Playwright. Live Codex/WebMCP rehearsal remains **PENDING** until the deployed WebMCP-enabled surface is available; do not record invented timings or transcripts.
