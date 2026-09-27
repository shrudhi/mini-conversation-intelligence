# VelaWear PROJECT_HANDOFF

**Audit date:** 2026-09-28  
**Scope:** Documentation only — no application code was changed for this handoff.  
**Git commit:** *Unavailable* — this workspace is **not** a Git repository (no `.git` directory). There is no commit SHA to report. Initialize git and commit before sharing a versioned handoff.

**Product in one line:** A local Next.js demo for a fictional Indian fashion retailer (“VelaWear”) where a customer can talk (text or press-to-talk voice) to a support agent about demo orders/returns/refunds, and a PM can tune presentation settings and review scored conversations.

Status tags used below:


| Tag                       | Meaning                                                    |
| ------------------------- | ---------------------------------------------------------- |
| **IMPLEMENTED**           | Present in code and exercised by UI and/or tests           |
| **PARTIAL**               | Present but incomplete, gated, outdated docs, or demo-only |
| **PLANNED / NOT PRESENT** | Not found in the codebase                                  |


Do **not** treat this demo as production-ready, multi-tenant, or as a real OMS/CRM/RAG system unless the citations below prove otherwise.

---



## 1. Working features and user flows

Shell: `app/page.tsx` renders `DemoApp` (`components/demo-app.tsx`), which switches client views: `"landing" | "support" | "pm" | "settings"`. There are no separate App Router pages for those surfaces.

### 1.1 Landing → choose demo customer — **IMPLEMENTED**


| Step       | What happens                                                         | Citation                                                                                        |
| ---------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Load cards | `GET /api/status` returns `cards` from `listWorkspaceCards()`        | `app/api/status/route.ts` `GET`; `lib/customers.ts` `listWorkspaceCards` / `buildWorkspaceCard` |
| UI         | Hero + “Choose a demo customer” grid with per-customer avatar images | `components/landing-page.tsx`; avatars via `lib/avatars.ts` `customerAvatarSrc`                 |
| Select     | Sets `bootstrap { customerId, orderId }` and opens support           | `components/demo-app.tsx` `selectCustomer`                                                      |




### 1.2 Customer profile / history — **IMPLEMENTED**


| Capability         | Behavior                                                                                       | Citation                                                                                       |
| ------------------ | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Sign-in            | `POST /api/status` with customer+order → `loginWorkspace` (order must belong to customer)      | `lib/customers.ts` `loginWorkspace`; `components/voice-agent.tsx` `signIn`                     |
| Profile rail       | Name, city, member since, current issue, priority, order/product/refund meta, try-saying hints | `components/voice-agent.tsx` (customer rail); priority from `lib/priority.ts` `assessPriority` |
| Past conversations | Fixture history from `fixtures/customers.json` merged with saved history                       | `lib/feedback.ts` `historyForCustomer` / `listConversationHistory`; UI in `VoiceAgent`         |
| Archive view       | Read-only transcript + feedback display                                                        | `components/voice-agent.tsx` archive overlay                                                   |


**Important (vs older README):** Signed-in demo profile is trusted. The agent **does not** require a spoken PIN before disclosing the selected order (`lib/agent.ts` `applyCustomerTurn` auto-sets `verifiedOrderId` from `selectedOrderId`). Asking for PIN/OTP on a signed-in profile is treated as an identity failure in evaluation. README still describes a PIN-first flow — that doc is **outdated** (**PARTIAL** documentation drift).

### 1.3 Text and voice conversations — **IMPLEMENTED** (live STT/TTS/model **PARTIAL** without API key)


| Flow         | Behavior                                                                                          | Citation                                                                                                                            |
| ------------ | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Text send    | `sendMessage` → `POST /api/agent-turn`                                                            | `components/voice-agent.tsx` `sendMessage`; `app/api/agent-turn/route.ts` `POST`                                                    |
| Voice record | MediaRecorder → `transcribe` → `POST /api/transcribe` → draft for review → Send                   | `VoiceAgent` `transcribe` / `sendDraft`; `app/api/transcribe/route.ts`; `lib/speech.ts` `transcribeAudio`; limits in `lib/audio.ts` |
| Agent reply  | Deterministic `applyCustomerTurn` then optional model phrasing                                    | `lib/agent.ts` `applyCustomerTurn`; `lib/phrase.ts` `phraseWithModel`                                                               |
| Spoken reply | `playSpeech` → `POST /api/speech` → `synthesizeSpeech`                                            | `VoiceAgent` `playSpeech`; `app/api/speech/route.ts`; `lib/speech.ts` `synthesizeSpeech`                                            |
| Chat UI      | WhatsApp-style rows with customer + agent avatars                                                 | `components/voice-agent.tsx`; `AGENT_AVATAR_SRC` / `customerAvatarSrc` in `lib/avatars.ts`                                          |
| Approvals    | Pending escalation → Approve / Not now → `POST /api/escalate`                                     | `app/api/escalate/route.ts`; tickets via `lib/tickets.ts` `createApprovedTicket`                                                    |
| Language UI  | Radio `en` / `hi` / `auto` on conversation panel                                                  | `components/voice-agent.tsx`; defaults from PM settings via `GET /api/settings`                                                     |
| Without key  | Local template replies labeled Simulated; Record/speech/judge stay unavailable or fail gracefully | `lib/env.ts` `hasApiKey`; agent-turn skips `phraseWithModel` when no key                                                            |




### 1.4 End conversation + customer feedback — **IMPLEMENTED**


| Step   | Behavior                                                                                 | Citation                                                                                                                                |
| ------ | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| End    | `endConversation` → `POST /api/evaluate` (saves eval run, ends session, appends history) | `VoiceAgent` `endConversation`; `app/api/evaluate/route.ts` `POST`; `lib/feedback.ts` `appendConversationHistory` / `buildHistoryEntry` |
| Survey | Modal: satisfied yes/no; resolved yes/partly/no; comment; or skip                        | `components/feedback-modal.tsx`; `POST /api/feedback` → `lib/feedback.ts` `saveFeedback`                                                |




### 1.5 PM Agent settings — **IMPLEMENTED**


| Capability   | Behavior                                                                     | Citation                                                                                                           |
| ------------ | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| UI           | Tone, response length, empathy, greeting, sign-off, language, voice, preview | `components/pm-settings.tsx`                                                                                       |
| Persist      | `GET`/`PUT /api/settings` → `data/agent-settings.json`                       | `app/api/settings/route.ts`; `lib/agent-settings-store.ts` `getAgentSettings` / `saveAgentSettings`                |
| Preview      | `POST /api/settings/preview`                                                 | `app/api/settings/preview/route.ts`                                                                                |
| Apply scope  | **New conversations only**; each session freezes `agentStyle`                | `app/api/agent-turn/route.ts` `newSession` + `snapshotAgentSettings`; type on `PersistedSession` in `lib/types.ts` |
| Safety bound | Style is presentation-only (must not change policy/facts)                    | `lib/agent-settings.ts` `stylePhrasingInstructions` / `applyPresentationStyle`                                     |


Unavailable voice/preview options are marked when `OPENAI_API_KEY` is missing (`getAgentSettingsCapabilities` in `lib/agent-settings-store.ts`). Speech speed is not offered — it is not reliably supported for the demo TTS model.

### 1.6 Performance dashboard — **IMPLEMENTED**


| Capability          | Behavior                                                                                                                                                                                                                                 | Citation                                                            |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Load                | `GET /api/evaluate`                                                                                                                                                                                                                      | `app/api/evaluate/route.ts` `GET`; UI `components/pm-dashboard.tsx` |
| Overview            | KPIs (pass rate, policy/action accuracy, latency), feedback KPIs, rubric strength, pass trend, product decisions (top 3 + modal with related chats), paginated recent conversations (50/page), InfoTip definitions (no glossary section) | `PmDashboard`; metrics from `lib/evaluate.ts` `summarizeMeasured`   |
| Conversation detail | Scorecard, trace, evidence, human language review, optional AI judge                                                                                                                                                                     | `PmDashboard`; `evaluateConversation`                               |
| Frozen style        | Shows `agentStyle` used for that chat                                                                                                                                                                                                    | Snapshot field from `GET /api/evaluate` conversationSnapshots       |


**Removed from UI (still in API payloads):** Scenario explorer tab was removed from the dashboard. Labeled scenario previews still exist server-side via `simulatedPreviews()` (`lib/evaluate.ts`) and are returned as `scenarios` / `previews` for labeling filters — not as a separate explorer UI.

### 1.7 Feature status matrix


| Feature                               | Status                                                        |
| ------------------------------------- | ------------------------------------------------------------- |
| Landing + customer select + avatars   | **IMPLEMENTED**                                               |
| Signed-in support chat (text)         | **IMPLEMENTED**                                               |
| Press-to-talk STT + TTS               | **IMPLEMENTED** with key; **PARTIAL** without                 |
| Model phrasing of approved replies    | **IMPLEMENTED** with key; else simulated templates            |
| Mock ticket after approval            | **IMPLEMENTED**                                               |
| Customer feedback survey              | **IMPLEMENTED**                                               |
| Past conversation archive             | **IMPLEMENTED**                                               |
| PM settings + per-session freeze      | **IMPLEMENTED**                                               |
| PM performance dashboard              | **IMPLEMENTED**                                               |
| Scenario explorer UI                  | **NOT PRESENT** (removed; API still serves scenario metadata) |
| Real OMS/CRM, auth, multi-tenant SaaS | **PLANNED / NOT PRESENT**                                     |
| Vector RAG / embeddings store         | **NOT PRESENT** (local lexical retrieval only)                |


---



## 2. Architecture and technologies



### 2.1 Stack — **IMPLEMENTED**


| Layer      | Technology                          | Citation                                              |
| ---------- | ----------------------------------- | ----------------------------------------------------- |
| Framework  | Next.js `^15.5.4` (App Router)      | `package.json`                                        |
| UI         | React `^19.1.1`, client components  | `components/*`                                        |
| Language   | TypeScript                          | `tsconfig.json`, `npm run typecheck`                  |
| LLM SDK    | `openai` `^7.23.0`                  | `package.json`; used from speech/phrase/judge modules |
| Validation | Zod (phrasing schema)               | `lib/phrase.ts`                                       |
| Database   | **None** — JSON files under `data/` | `lib/persist.ts`                                      |




### 2.2 API routes


| Route                        | Role                                    | File                                |
| ---------------------------- | --------------------------------------- | ----------------------------------- |
| `GET/POST /api/status`       | Health, models, cards; login workspace  | `app/api/status/route.ts`           |
| `POST /api/transcribe`       | Audio → transcript                      | `app/api/transcribe/route.ts`       |
| `POST /api/agent-turn`       | Customer message → agent reply          | `app/api/agent-turn/route.ts`       |
| `POST /api/speech`           | Reply text → audio                      | `app/api/speech/route.ts`           |
| `POST /api/escalate`         | Approved mock ticket                    | `app/api/escalate/route.ts`         |
| `GET/POST /api/evaluate`     | Dashboard payload; finish/score session | `app/api/evaluate/route.ts`         |
| `POST /api/feedback`         | Satisfaction survey                     | `app/api/feedback/route.ts`         |
| `GET/PUT /api/settings`      | PM style defaults                       | `app/api/settings/route.ts`         |
| `POST /api/settings/preview` | TTS preview                             | `app/api/settings/preview/route.ts` |




### 2.3 Core server modules


| Module                        | Key exports                                                       | Role                               |
| ----------------------------- | ----------------------------------------------------------------- | ---------------------------------- |
| `lib/agent.ts`                | `createState`, `applyCustomerTurn`                                | Decision/routing/reply composition |
| `lib/routing.ts`              | `classifyMessage`, `findProfileConflict`                          | Greeting vs support vs unrelated   |
| `lib/rules.ts`                | `decideCase`                                                      | Eligibility / escalation offer     |
| `lib/reply.ts`                | `composeReply`, `makeCustomerFriendly`, `phrasingPreservesIntent` | Template replies                   |
| `lib/retrieve.ts`             | `retrievePolicies`, `rankPolicies`, `tokenize`                    | Local policy “retrieval”           |
| `lib/cases.ts`                | case/policy loaders, `lookupTools`                                | Fixture records as “tools”         |
| `lib/phrase.ts`               | `phraseWithModel`                                                 | Optional natural-language phrasing |
| `lib/speech.ts`               | `transcribeAudio`, `synthesizeSpeech`                             | STT / TTS                          |
| `lib/guard.ts`                | `guardReply`, `constraintsFor`                                    | Leak / PIN / jargon guards         |
| `lib/evaluate.ts`             | `evaluateConversation`, `summarizeMeasured`                       | Rubric + dashboard aggregates      |
| `lib/score.ts`                | `scoreOutcome`, `isOverallPass`, `GATE_CRITERIA`                  | Scoring math                       |
| `lib/sessions.ts`             | `saveSession`, `listSessions`, `saveRun`                          | Session/run persistence            |
| `lib/tickets.ts`              | `createApprovedTicket`                                            | Mock tickets                       |
| `lib/feedback.ts`             | feedback + conversation history                                   | Surveys / archive                  |
| `lib/language.ts`             | `detectLanguage`, `resolveReplyLanguage`                          | Language handling                  |
| `lib/priority.ts`             | `assessPriority`                                                  | Demo priority labels               |
| `lib/limits.ts`               | `withAgentSlot`, counters                                         | Per-process request limits         |
| `lib/env.ts`                  | `hasApiKey`, model getters                                        | Env wiring                         |
| `lib/agent-settings.ts`       | style types + presentation helpers                                | PM settings model                  |
| `lib/agent-settings-store.ts` | get/save settings                                                 | Disk persistence                   |
| `lib/avatars.ts`              | `customerAvatarSrc`, `AGENT_AVATAR_SRC`                           | Static avatar paths                |




### 2.4 How a spoken request becomes a spoken response — **IMPLEMENTED** (when key present)

Exact pipeline:

1. **Capture** — Browser `MediaRecorder` in `VoiceAgent`; client tracks duration (`components/voice-agent.tsx`).
2. **STT** — `POST /api/transcribe` validates audio (`lib/audio.ts` `assertAudioAcceptable`) then `transcribeAudio` (`lib/speech.ts`) using `transcriptionModel()` (`lib/env.ts`), with `languageMode` from the UI/session.
3. **Review** — Transcript shown for correction; nothing agent-side until Send (`sendDraft` / `sendMessage`).
4. **Agent turn** — `POST /api/agent-turn`:
  - Load or create `PersistedSession`; new sessions freeze `agentStyle` from `getAgentSettings()` (`agent-turn` `newSession`).
  - `applyCustomerTurn` (`lib/agent.ts`): intent (`lib/intent.ts`), classify message (`lib/routing.ts`), retrieve policies (`retrievePolicies`), look up fixture tools (`lookupTools`), decide escalation (`decideCase`), compose approved text (`composeReply`).
  - Optional: replace greeting with PM greeting (`applyPresentationStyle`).
  - If `hasApiKey()`: `phraseWithModel` (`lib/phrase.ts`) with `stylePhrasingInstructions`; then `guardReply` + `phrasingPreservesIntent`; on failure keep local reply.
  - `saveSession` → `data/sessions.json`.
5. **TTS** — Client calls `POST /api/speech` with `sessionId` + `turnId`; `synthesizeSpeech` uses session `agentStyle.voice` when present (`app/api/speech/route.ts`).
6. **Playback** — Browser plays returned MP3; playback status can be recorded on the turn.

Without `OPENAI_API_KEY`, steps 2 / model-phrasing / 5 do not produce live provider audio/phrasing; typed turns still get deterministic template replies.

### 2.5 Language handling — **IMPLEMENTED**


| Mode        | Behavior                                                                                                                                                       | Citation                                                                                             |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `en` / `hi` | Forced reply language                                                                                                                                          | `lib/language.ts` `resolveReplyLanguage`                                                             |
| `auto`      | Follow detected English / Hindi / Hinglish from the conversation; keep preference on short follow-ups; **otherwise English**; **never** asks “choose language” | `resolveReplyLanguage`; ask-language path removed from `lib/agent.ts`; tests in `tests/core.test.ts` |
| STT         | `en`/`hi` language hint or auto `languages: ["en","hi"]`                                                                                                       | `lib/speech.ts` `transcribeAudio`                                                                    |
| TTS         | Instructions differ for en / hi / hinglish                                                                                                                     | `lib/speech.ts` `speechInstructions`                                                                 |




### 2.6 Tools / actions — **IMPLEMENTED** (simulated)

“Tools” are **not** remote APIs. `lookupTools` in `lib/cases.ts` returns structured facts from the fixture case (order / return / refund) or a simulated failure when `toolFailure` is set. Escalation “action” is a mock ticket in `data/tickets.json` after customer approval (`lib/tickets.ts` `createApprovedTicket`, idempotent via `idempotencyKey` in `lib/constants.ts`).

---



## 3. Where customer cases and policies come from


| Data                                   | Source                                       | How loaded                                                                                  | Live system?                                                                       |
| -------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Customers                              | `fixtures/customers.json`                    | `lib/customer-profiles.ts` `listCustomers` / `getCustomer`                                  | **Hardcoded fixture**                                                              |
| Cases / orders                         | `fixtures/cases.json`                        | `lib/cases.ts`                                                                              | **Hardcoded fixture** (includes demo `pin` fields)                                 |
| Policies                               | `fixtures/policies.json`                     | `lib/cases.ts` `listPolicies`                                                               | **Hardcoded fixture** (`POLICY_VERSION` = `vela-returns-v1` in `lib/constants.ts`) |
| Labeled scenarios                      | `fixtures/expected.json`                     | `lib/evaluate.ts` `listScenarios` / `runScenario`                                           | **Hardcoded fixture** for tests/previews                                           |
| Policy “retrieval”                     | In-memory lexical rank over fixture policies | `lib/retrieve.ts` `rankPolicies` / `retrievePolicies` (token overlap + alias boosts; top 3) | **Simulated retrieval** — **not** a vector DB / hosted RAG                         |
| Tickets                                | Created at runtime                           | `data/tickets.json`                                                                         | **Mock persisted** IDs                                                             |
| Sessions / evals / feedback / settings | Runtime                                      | `data/*.json` via `lib/persist.ts`                                                          | **Local file store**                                                               |


**Clear statement:** Customer cases and return/refund policies are **invented demo fixtures hardcoded in JSON**. They are **retrieved** only by local scoring over those fixtures. They are **not** loaded from a production database, CMS, or external knowledge base. Fixture scenario previews are **simulated** and excluded from measured dashboard rates (`summarizeMeasured` filters `source === "live"`).

---



## 4. How evaluations work



### 4.1 What is checked — **IMPLEMENTED**

`evaluateConversation` (`lib/evaluate.ts`) scores six criteria (`lib/constants.ts` `CRITERION_IDS` / `RUBRIC_WEIGHTS`):


| Criterion          | Weight | Intent (code-level)                                                                               |
| ------------------ | ------ | ------------------------------------------------------------------------------------------------- |
| `policy_accuracy`  | 25     | Citations match policy text; labeled Recall@3 / expected IDs when scenario present                |
| `case_grounding`   | 20     | Facts grounded; no premature/cross-case leakage                                                   |
| `action_safety`    | 20     | Tickets only after approval; eligibility respected; no invented escalations                       |
| `identity_privacy` | 15     | No secret leaks; PIN/OTP asks on signed-in profile fail                                           |
| `task_outcome`     | 10     | Scenario mustInclude/Exclude / ticket expectations, or generic task signals                       |
| `language_quality` | 10     | Default `not_assessable` until human review or optional AI judge (`lib/judge.ts` `judgeLanguage`) |




### 4.2 Score math — **IMPLEMENTED**

`scoreOutcome` (`lib/score.ts`):

- Points: pass = full weight, partial = 0.5×, fail = 0 (`pointsFor`).
- Headline ≈ `100 × earned / assessedWeight`.
- **Coverage** = assessedWeight / applicableWeight. If coverage **< 80%**, headline is withheld (`label: "incomplete"`) so thin chats cannot look like strong launches.
- **Overall pass** (`isOverallPass`): published score **and** no `fail` on `GATE_CRITERIA` (policy, grounding, action, identity, task). A high headline with a gate fail is **not** a pass.



### 4.3 Dashboard figures — **IMPLEMENTED**

`summarizeMeasured` (`lib/evaluate.ts`):

- Includes only **live** eval runs (`run.source === "live"`).
- Pass rate = overall-pass count / live runs.
- Criterion health / pass trend / product decisions with `relatedChats`.
- Drafts (sessions with turns but no saved run) counted separately, **not** in rates.
- Customer feedback rates from `summarizeFeedback` (`lib/feedback.ts`).

Client-side filter recompute: `summarizeClient` inside `components/pm-dashboard.tsx`.

### 4.4 Evidence saved — **IMPLEMENTED**

Each criterion can attach `evidence: Array<{ label: string; quote: string }>` on the eval run (`lib/types.ts` `CriterionResult`). Runs persist in `data/runs.json` via `saveRun` (`lib/sessions.ts`). Conversation turns already store citations, tools, uncertainties, speech, latency, usage on the session (`ConversationTurn` in `lib/types.ts`).

### 4.5 What cannot yet be measured reliably — **PARTIAL / honest limits**


| Gap                                  | Why                                                               |
| ------------------------------------ | ----------------------------------------------------------------- |
| `language_quality`                   | Usually `not_assessable` until human note or paid AI judge        |
| Voice UX quality / pronunciation     | No automated listening metric; TTS “sounds OK” is human judgment  |
| Statistical confidence               | Small local demo N; dashboard does not claim confidence intervals |
| Real customer satisfaction causality | Feedback is optional demo survey, not linked to production CSAT   |
| Retrieval quality beyond fixtures    | Lexical overlap on ~11 policy chunks — not production RAG eval    |
| Cost                                 | Dashboard does not estimate dollar cost of provider calls         |


---



## 5. What persists across refreshes vs memory-only



### Persisted on disk (`data/` via `lib/persist.ts` `readJson` / `writeJson`) — **IMPLEMENTED**


| File                        | Contents                                           | Writers                          |
| --------------------------- | -------------------------------------------------- | -------------------------------- |
| `sessions.json`             | Full conversation sessions + optional `agentStyle` | `lib/sessions.ts` `saveSession`  |
| `runs.json`                 | Evaluation runs / scorecards                       | `saveRun`                        |
| `tickets.json`              | Mock support tickets                               | `lib/tickets.ts`                 |
| `feedback.json`             | Customer surveys                                   | `lib/feedback.ts` `saveFeedback` |
| `conversation-history.json` | Archive entries for past-conversations UI          | `appendConversationHistory`      |
| `agent-settings.json`       | PM style defaults                                  | `lib/agent-settings-store.ts`    |


Browser refresh **keeps** these. Deleting `data/*.json` resets demo state.

### Memory-only / process-local — **IMPLEMENTED**


| State                                         | Behavior                                                                        | Citation                                   |
| --------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------ |
| Request counters / in-flight lock             | Reset when Node process restarts                                                | `lib/limits.ts`                            |
| React UI state (draft, recorder, open modals) | Lost on refresh until reloaded from APIs                                        | `components/voice-agent.tsx`               |
| Fixture JSON                                  | Loaded into module memory at import; source of truth is files under `fixtures/` | `lib/cases.ts`, `lib/customer-profiles.ts` |


Static avatars under `public/avatars/` are files on disk served by Next.js (not DB).

---



## 6. Tests, known limitations, demo readiness



### 6.1 Tests run for this handoff (2026-09-28)


| Command             | Result                                                                     |
| ------------------- | -------------------------------------------------------------------------- |
| `npm test`          | **39 passed**, 0 failed (`tests/core.test.ts`, Node test runner via `tsx`) |
| `npm run typecheck` | **Passed** (`tsc --noEmit`)                                                |


Tests use a temp data dir (`setDataDirForTests` in `lib/persist.ts`) and **do not** call OpenAI. Coverage includes retrieval, language auto-mode, scoring/gates/coverage, signed-in-without-PIN, tickets/idempotency, injection/privacy, scenario catalog, feedback/history, agentStyle freeze, audio limits, and per-order path smoke checks.

**Not executed here as a full live E2E:** real microphone → STT → model phrase → TTS in a browser with a paid key (implemented in code, not re-run for this audit).

### 6.2 Known bugs / limitations


| Item                                             | Status                       | Notes                                                                                         |
| ------------------------------------------------ | ---------------------------- | --------------------------------------------------------------------------------------------- |
| README PIN-first walkthrough + Scenario explorer | **Outdated docs**            | Code uses profile sign-in; Scenario explorer UI removed                                       |
| Live voice quality                               | **Unverified automatically** | Requires human listen-through with API key                                                    |
| Provider defaults in `.env.example`              | **Environment-specific**     | `AGENT_MODEL`, `TRANSCRIPTION_MODEL`, `TTS_MODEL` names must match your OpenAI account access |
| No Git history                                   | **Process gap**              | Cannot cite a commit SHA from this folder today                                               |
| `language_quality` often blank                   | **By design**                | Needs human or AI judge                                                                       |
| Demo PINs in fixtures                            | **Public demo secrets**      | Still in `fixtures/cases.json` — do not treat as real credentials                             |
| Single-process limits                            | **Demo guardrails**          | `MAX_`* env caps; one in-flight provider call (`lib/limits.ts`)                               |




### 6.3 Needed before a public demo

1. Initialize Git, commit a known revision, and keep `.env.local` out of the repo.
2. Update README to match signed-in profile (no PIN gate) and current dashboard (no Scenario explorer UI; Agent settings page).
3. Provision a valid `OPENAI_API_KEY` and confirm model names work; do a scripted live walkthrough (English + Hindi + one approval ticket).
4. Clear or scrub local `data/` if it contains personal trial comments.
5. Do not expose tunnel URLs without rate limits; this app has no auth.
6. Explicitly label the site as a **fictional demo** (already in README tone).
7. Optional: hide or stop displaying demo PINs on UI cards if still shown anywhere for press demos.

---



## 7. Deployment, environment variables, secrets



### 7.1 Local deployment steps — **IMPLEMENTED** path

```bash
cd mini-conversation-intelligence
npm install
cp .env.example .env.local   # only if testing live STT/TTS/phrasing
# edit .env.local — set OPENAI_API_KEY (never NEXT_PUBLIC_*)
npm test
npm run typecheck
npm run build
npm run dev                  # or: npm start after build
```

Open the localhost URL from Next.js. Restart after changing env vars.

There is **no** Dockerfile, Kubernetes manifest, or hosted DB migration in this repo (**NOT PRESENT**).

### 7.2 Environment variables (names only)

From `.env.example` and `lib/env.ts` / `lib/constants.ts` `intEnv` / `lib/audio.ts`:


| Variable                     | Purpose                                             |
| ---------------------------- | --------------------------------------------------- |
| `OPENAI_API_KEY`             | Enables live STT, TTS, model phrasing, AI judge     |
| `AGENT_MODEL`                | Text phrasing model id                              |
| `TRANSCRIPTION_MODEL`        | Speech-to-text model id                             |
| `TTS_MODEL`                  | Text-to-speech model id                             |
| `TTS_VOICE`                  | Default TTS voice id                                |
| `MAX_AGENT_REQUESTS`         | Per-process agent call cap                          |
| `MAX_TRANSCRIPTION_REQUESTS` | Per-process STT cap                                 |
| `MAX_TTS_REQUESTS`           | Per-process TTS cap                                 |
| `MAX_AUDIO_BYTES`            | Max upload size                                     |
| `FEEDBACK_FORCE_FAIL`        | Test-only feedback failure hook (`lib/feedback.ts`) |




### 7.3 Secrets and demo data that must not be exposed as “real”


| Item                                        | Risk                                                     |
| ------------------------------------------- | -------------------------------------------------------- |
| `OPENAI_API_KEY` in `.env.local`            | Real secret — never commit or ship to the browser        |
| Demo PINs in `fixtures/cases.json`          | Public demo values — do not reuse as production secrets  |
| `data/sessions.json`, `feedback.json`, etc. | May contain trial utterances/comments from local testers |
| Tunnel URLs (localtunnel/ngrok)             | Unauthenticated access to the whole demo                 |


---



## Implemented vs partial vs planned (summary)



### Implemented

- Full local demo loop: select customer → text/voice chat → approve mock ticket → end → feedback → PM dashboard.
- Fixture-backed policies/cases/customers; lexical policy retrieval; deterministic rules engine.
- Optional OpenAI STT / phrasing / TTS / language judge when keyed.
- PM Agent settings with disk persistence and per-conversation style snapshots.
- Rubric evaluation, coverage gate, overall-pass gates, measured aggregates, product-decision suggestions with chat links.
- Avatars for customers and agent in landing + chat.
- Auto language without confirmation prompt.



### Partially working / gated

- Live voice and model phrasing without a valid provider key/models.
- Language quality scoring without human/AI judge.
- README accuracy vs current UX.
- “Retrieval” is fixture lexical search, not production RAG.



### Planned / not present

- Git-tracked release in this folder (no `.git` at audit time).
- Production auth, multi-tenant hosting, real order systems, vector RAG, CI deployment configs, dollar cost analytics, Scenario explorer UI.

---



## Short summary (paste into ChatGPT)

```text
VelaWear is a local Next.js 15 / React 19 demo (not a git repo in this folder—no commit SHA) for a fictional Indian fashion retailer’s voice/text support agent. Customers pick a fixture profile, chat by text or press-to-talk, get rule-based answers from hardcoded JSON cases/policies (lexical retrieval over fixtures—not vector RAG or a real OMS), optionally phrased/spoken via OpenAI when OPENAI_API_KEY is set, and can approve mock tickets. PM Agent Settings (tone/length/empathy/greeting/sign-off/language/voice) persist to data/agent-settings.json and freeze per new session only. Ending a chat saves eval runs + history JSON; optional feedback surveys persist too. The PM dashboard scores live runs on a 6-criterion rubric (80% coverage gate; gated fails block overall pass), shows feedback KPIs and product decisions with chat links—no Scenario explorer UI anymore. Storage is local data/*.json files, not a database. npm test: 39/39 pass; typecheck passes. README still mentions PIN-first flow and Scenario explorer—those are outdated vs signed-in profile and current UI. Not production-ready; do not expose API keys, tunnels without auth, or demo PINs as real secrets.
```

