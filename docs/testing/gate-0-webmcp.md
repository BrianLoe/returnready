# Gate 0 — WebMCP recording-client feasibility

## Purpose

Prove the intended recording client (Codex / ChatGPT in-app browser) can discover
and invoke a harmless read-only WebMCP tool (`ping_returnready`) registered by a
page, before investing in product UI. See plan Task 0 and the design spec.

## Gate verdict split (Ruling R1)

The raw "WebMCP unavailable" message has two very different causes and only one is
a real failure:

- **(a) Environmental — NOT a gate FAIL.** `document.modelContext` /
  `registerTool` is undefined because WebMCP is origin-trial gated (see plan
  Task 8) and the origin has no trial token / the browser has no WebMCP flag.
  Fix the origin (enable the Chrome flag, or re-test on the deployed token'd
  HTTPS origin); do not stop the build.
- **(b) Real gate FAIL.** The API is present, the page shows
  `WebMCP tool registered`, but the recording-client agent will not discover +
  invoke `ping_returnready` from a natural-language prompt. This is the only
  outcome that triggers the plan's STOP condition.

## Automatable pre-check (controller-run, no user)

- **Date/time:** 2026-08-31 ~22:57 AEST
- **Served URL:** http://127.0.0.1:4173/ (python -m http.server, directory
  `spikes/gate-0-webmcp`)
- **HTTP:** 200, page title "ReturnReady Gate 0", module script executed
- **Browser:** Chrome 151.0.0.0 (Playwright-driven), UA
  `Mozilla/5.0 (Windows NT 10.0; Win64; x64) ... Chrome/151.0.0.0 Safari/537.36`
- **`document.modelContext` present:** false
- **`document.modelContext.registerTool` present:** false
- **Page `#status`:** `WebMCP unavailable`

**Interpretation:** Ruling R1 branch **(a) — environmental, expected on a plain
localhost origin with no origin trial**. The spike page's registration code path
is syntactically valid and its feature-detection branch behaves correctly. The
registration *mechanism* is therefore pre-verified to the extent an
origin-without-trial allows; the API-present + invoke path could not be exercised
here because the API is absent by design on this origin.

**Status: PRE-CHECK COMPLETE (mechanism valid; API absent = environmental).**

## Parked — requires the user's Codex / ChatGPT in-app browser

The real recording-client proof (R1 branch (b)) is a human-in-the-loop step that
cannot be run by the controller or a subagent. It is PARKED per the user's AFK
authorization to build Tasks 1–7 first.

When the user is back, run on a WebMCP-enabled surface (deployed token'd origin,
or a flag-enabled Chrome that the in-app browser honours):

1. Open the served page in Codex's in-app Browser.
2. Prompt exactly:
   `Call the read-only ReturnReady ping tool on this page. Reply with only its returned message.`
3. PASS = the agent discovers `ping_returnready`, invokes it, and replies
   `ReturnReady Gate 0 reached`. A typed JS injection or manual button click does
   NOT count.
4. If discovery/invocation/result fails (branch (b)): record the exact failure and
   STOP — ask whether to revise the recording client or the spec. Do not
   substitute Chrome DevTools automation, an extension, or manual execution.

Record the final PASS/FAIL, Codex desktop version, and in-app browser
UA/version here at that time.
