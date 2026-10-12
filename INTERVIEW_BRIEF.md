# VelaWear Voice Care — Interview brief (Product Manager)

Use this as your talking script. Speak in **outcomes and decisions**, then drop one technical detail to show depth.

**Local demo:** http://localhost:3000 (`npm run dev`)  
**Live:** your Vercel deploy of this repo  
**Role framing:** You owned the product problem, agent policy, quality metrics, and PM/Support dashboards; engineering implemented on Next.js + OpenAI.

---

## 1. Elevator pitch (30–45 seconds)

> I built **VelaWear**, a bilingual (English/Hindi) **AI voice support demo** for a fictional Indian fashion brand. Customers talk by text or press-to-talk about returns and refunds. The agent behaves like a **call-centre Care agent**—introduces itself, stays empathetic, auto-creates tickets on critical overdue cases, and keeps context on follow-ups.  
> As PM I also shipped a **Performance dashboard** (volume, latency, sentiment, pass rate, CSAT) and a **Conversation review** workspace so supervisors can score chats on a gated rubric—not just “looks fluent.”  
> Stack: **Next.js, OpenAI STT/TTS + phrasing, deterministic policy/rules engine, JSON fixtures, Vercel.**

---

## 2. Problem we solved

| Pain | Product response |
|------|------------------|
| Voice bots sound scripted / reset context | Care-style intro (“Priya from VelaWear Care”), empathy, context-aware follow-ups |
| Bots ask users to confirm tickets they don’t understand | **Auto-ticket** for P1 / overdue / escalating; inform customer of ticket ID |
| “AI quality” is vague | **6-criterion rubric** with gates; incomplete scores if coverage &lt; 80% |
| PMs can’t decide what to fix | **Performance dashboard** charts + recommended product decisions with evidence |
| Support can’t coach the agent | **Conversation review** scorecard, coaching queue, human language review |

**Honest framing:** This is a **portfolio / demo product** with fixture customers and mock tickets—not a live OMS. The point is to show end-to-end product thinking: policy → conversation → measurement → decision layer.

---

## 3. What’s implemented (features)

### Customer support experience
- Landing → pick a **demo customer** (Rohan, Meera, etc.) with issue + priority
- Signed-in workspace: profile, current order/refund, live sentiment/priority
- **Text + press-to-talk voice** (STT → review draft → send → agent reply → TTS)
- Language: English / Hindi / Auto
- Agent: **Priya**, Care intro, policy-grounded answers, citations internally
- Critical cases: **auto-create payment-support ticket** (no “say yes”)
- Follow-ups like “What will happen with that?” stay on the live offer
- End chat → optional **CSAT / resolution survey** → archived history

### PM controls
- **Agent settings**: tone, length, empathy, language default, voice  
  - Style is **presentation-only** (cannot change policy/facts)  
  - Settings **freeze per conversation** so A/B isn’t polluted mid-chat

### Two dashboards (recent)
1. **Performance dashboard** — decision / ops layer  
   Volume, pass-rate trend, latency trend + stage breakdown (STT / retrieval / model / TTS), language mix, sentiment mix, ticket mix, issue focus, rubric strength, product decisions, CSAT / resolution / ticket rate / P95 latency (every label has an info icon)
2. **Conversation review** — agent evaluation for support leads  
   Priya scorecard, **coaching queue**, conversation table, criterion scorecard. Full turn evidence + human language review opens from a chat (no separate “Conversation detail” tab).

**Empty-dashboard fix:** If no live evals exist (common on Vercel ephemeral storage), we show **sample portfolio data** from fixture scenarios with a clear banner—so demos never look broken.

---

## 4. Tech stack (say this cleanly)

| Layer | Choice | Why (PM language) |
|-------|--------|-------------------|
| App | **Next.js 15** (App Router) + React 19 | Fast full-stack demo, one deploy |
| Hosting | **Vercel** | Portfolio-ready; note: filesystem is ephemeral → `/tmp` + client session bag |
| Voice | **OpenAI** speech-to-text + text-to-speech | Real STT/TTS for the Care experience |
| Phrasing | OpenAI chat model (optional) | Natural spoken replies **on top of** deterministic facts |
| Policy / case truth | Local **JSON fixtures** + rules engine | Ground truth you can score; no fake “RAG over the internet” |
| Persistence | JSON files under `data/` (or `/tmp` on Vercel) | Simple for demo; not a production DB |
| Quality | Deterministic **rubric scorer** + optional AI language judge | Measurable quality, not vibes |
| Tests | Node test runner + TypeScript | ~40+ regression tests on policy/behaviour |

**Architecture in one sentence:**  
*Deterministic brain (policy, case facts, tickets) → optional LLM for phrasing → STT/TTS for voice → eval rubric + dashboards for PM/Support.*

That split is a **key decision**: LLMs don’t invent refund amounts or create unsafe tickets.

---

## 5. Product / design decisions (high-signal for interview)

### A. Policy before fluency
We score **policy accuracy, case grounding, action safety, identity/privacy, task outcome, language quality**.  
A fluent wrong answer **fails**—overall pass requires gated criteria to pass, not just a high average.

### B. Auto-ticket on criticality (call-centre practice)
When refund is outside the normal window / P1 / escalating sentiment, the agent **creates the ticket and informs** the customer.  
We don’t ask for confirmation on something the customer can’t evaluate. We only ask for details we truly need.

### C. Intro + empathy + context (CARE flow)
First turn introduces Priya; replies acknowledge frustration; “उससे क्या होगा?” explains the ticket instead of resetting to “How can I help?”

### D. Style ≠ policy
PM can tune tone/empathy/voice, but **cannot** change eligibility, amounts, or ticket rules. Style freezes at conversation start.

### E. Measured vs simulated
Fixture scenario previews are for labeling/tests. **Measured dashboard rates** use ended **live** runs (or clearly labeled sample portfolio when empty).

### F. Two audiences, two dashboards
- PM → *what to ship / fix next* (Performance dashboard + decisions)  
- Support → *coach this agent on this chat* (Conversation review + rubric)

### G. Honest demo boundaries
Mock tickets (`CARE-…` display), fixture customers, no real payments/PII. Good to say: “I’d replace fixtures with OMS + durable store for production.”

---

## 6. Metrics — why we picked them, thresholds, how they’re calculated

**Shared rule (both dashboards):** “Measured” numbers use **ended live conversations** that have an eval run (`source === "live"`). In-progress chats and fixture-only scenario previews are **excluded** so rates are not inflated by demos or half-finished calls. If the store is empty, sample portfolio data fills charts (banner shown).

**Threshold legend:** **In code** = enforced in `lib/score.ts`, `lib/evaluate.ts`, `lib/observability.ts`, or UI colours. **PM target** = how you’d explain goals in an interview (not always a red alert in the app).

---

### 6A. Foundation — rubric & pass (used by both dashboards)

| Criterion | Weight | Why we selected it | Pass / fail logic |
|-----------|--------|--------------------|-------------------|
| Policy accuracy | 25 | Wrong refund rules = regulatory & brand risk | Deterministic: citations match `fixtures/policies.json`; labeled scenarios also check Recall@3 |
| Case grounding | 20 | Invented amounts/dates destroy trust | Facts must match signed-in case record; no disclosure violations |
| Action safety | 20 | Bad tickets = ops cost + wrong remediation | Ticket type, approval/auto-ticket rules, idempotency, eligibility |
| Identity & privacy | 15 | Cross-customer leak = ship blocker | No PIN/OTP on signed-in desk; no other customer’s data |
| Task outcome | 10 | Repeat contacts if ask ignored | Did the agent address the customer’s explicit request? |
| Language quality | 10 | Fluency without policy is insufficient | Often `not_assessable` until human review or AI judge |

**Headline score (0–100)**  
- **Why:** One number for leadership, but only when the run is “gradeable.”  
- **Calculation:** `100 × (points earned) ÷ (assessed rubric weight)`. Pass = full weight, partial = half, fail = zero.  
- **Threshold:** **Coverage (assessed ÷ applicable weight) must be ≥ 80%** or headline is **hidden** (`incomplete`). Stops one-turn chats from looking “launch ready.”

**Overall pass (launch bar)**  
- **Why:** A high average with a privacy or ticket failure is not shippable.  
- **Calculation:** Headline is published **and** **no `fail`** on gated criteria: policy, grounding, action safety, identity, task outcome. (Language can be not_assessable without blocking pass if gates pass.)  
- **Threshold:** Product treats **&lt; 60% overall pass** (with ≥ 2 measured runs) as **high-priority** “below launch bar” in recommended decisions.

**Per-criterion health (bar colours on dashboards)**  
- **Calculation:** `% of runs where that criterion was assessed (pass/partial/fail) that got pass`.  
- **UI thresholds:** **≥ 90%** green, **≥ 70%** amber, **&lt; 70%** red.  
- **Decision thresholds:** Criterion pass **&lt; 70%** (or any fail on identity/action) → **high** product decision; **&lt; 85%** → **medium**; else **watch**.

---

### 6B. Performance dashboard — metric by metric

| Metric | Why PM cares | Threshold / target (demo) | How it’s calculated |
|--------|----------------|---------------------------|---------------------|
| **Conversations / ended volume** | Load & adoption of voice Care | Watch trend, not a fixed % | Count live sessions; ended = `session.ended` |
| **Pass rate** | “Can we ship this agent?” | **Launch bar: aim ≥ 60%** overall pass; investigate if below | `overall-pass runs ÷ evaluated live runs` (respects dashboard filters) |
| **CSAT (satisfaction rate)** | Customer felt helped | **PM target ≥ 80%** satisfied among respondents | `submitted surveys with satisfied=yes ÷ submitted` (skipped ≠ dissatisfied) |
| **Resolution rate** | Issue actually fixed | **PM target ≥ 70%** “yes” among submitted | `resolved=yes ÷ submitted` feedback forms |
| **Feedback response rate** | Survey signal quality | **PM target ≥ 50%** submitted on ended chats | `submitted ÷ ended live conversations` |
| **Ticket rate** | Automation vs manual load | Contextual; spike with overdue mix is expected | `sessions with ticketId ÷ live sessions` |
| **Human handoff rate** | Escalation pressure | Lower is better unless policy requires human | `sessions with human_review proposed or ticket ÷ live sessions` |
| **Escalating / frustrated share** | Risk & staffing | **PM target:** watch if **&gt; 30%** of volume | `(sentiment escalating or frustrated) ÷ live sessions` |
| **Median turn latency** | Voice UX | **PM target ~2.5s** median per turn | Median of each turn’s `stt + retrieval + model + tts` |
| **P95 latency** | Worst-case UX | **PM target ~4s** P95 for voice demo | 95th percentile of all turn latencies |
| **Latency by stage** | Where to optimize | **In code (UI):** STT warn **≥ 0.8s**, model **≥ 1.2s**, TTS **≥ 1.5s**; red at **1.4×** | Average ms per stage across turns |
| **Pass rate over time** | Regression detection | **PM target:** investigate **&gt; 10 pt** day drop | Per calendar day: `pass runs ÷ runs that day` |
| **Conversation volume chart** | Ops planning | Tickets/handoffs rising faster than chats → policy gap | Per day: chats, tickets created, handoffs |
| **Language / sentiment / ticket / issue mix** | Capacity (Hindi vs EN), product focus | Dominant issue &gt; 40% share → FAQ/policy investment | Count share per category ÷ total |
| **Rubric strength** | Prioritize engineering | Fix **lowest pass % among high-weight** criteria first | Same as 6A criterion health, aggregated |
| **Recommended product decisions** | Action list for roadmap | Priority: **high / medium / watch** from rules below | Merges weak criteria + failure patterns + incomplete coverage |

**Product decision priority rules (observability):**  
- Failure pattern **≥ 35%** of failing runs → **high**; **≥ 20%** → **medium**.  
- **≥ 25%** of runs **incomplete** (coverage &lt; 80%) → medium decision on scorecard trust.  
- Linked chats attached as evidence for each decision.

**Policy SLA thresholds (what drives P1 / auto-ticket — not dashboard math but explains spikes):**  
- Prepaid refund late: **&gt; 7 working days** since refund start (day 7 exactly is **not** overdue).  
- COD refund late: **&gt; 10 working days**.  
- Pickup late: **&gt; 3 working days** pending.  
- Priority score **≥ 70 → P1**, **≥ 45 → P2**, else P3 (`lib/priority.ts`).

---

### 6C. Conversation review — metric by metric

| Metric | Why Support lead cares | Threshold / target | How it’s calculated |
|--------|------------------------|--------------------|---------------------|
| **Agent pass rate** | Coach to bar | **In code:** **&lt; 60%** triggers high “below launch bar” decision (≥ 2 runs) | `isOverallPass` on Priya’s evaluated live runs |
| **Avg score** | Trend vs pass (can diverge) | Meaningful only when coverage ≥ 80% | Mean of published headline scores |
| **CSAT / resolution** | Tie rubric to customer voice | Same as 6B | Feedback joined to ended sessions |
| **Needs review count** | Supervisor workload | **0** action-safety fails before release | Runs with `needs_review` / incomplete / not overall pass |
| **Language reviewed count** | Coaching completeness | Review **100%** of Hindi/escalating fails | Runs where language_quality source is human or AI judge |
| **Coaching queue** | Daily stand-up list | **High** first | Includes runs with any criterion **fail**, language **not_assessable**, or not overall pass |
| **Queue priority: high** | Same-day coaching | Escalating sentiment **or** action_safety fail | Rule-based sort, then by recency |
| **Queue priority: medium** | This week | Any other criterion fail | |
| **Queue priority: watch** | Spot-check | Pass gates but score/review gaps | |
| **Per-chat status pill** | Quick triage | **Pass** = overall pass; **Needs review** = fail/incomplete; **In progress** = not evaluated | `rowStatus()` in dashboard |
| **Assessed %** | Trust the score | **≥ 80%** required to show headline | `assessedWeight ÷ applicableWeight` |
| **Human language review** | Nuance STT/TTS miss | Required when deterministic check can’t score tone | POST evaluate with human `languageStatus` |
| **AI judge (optional)** | Scale review | Use when no human; same rubric | `judge: true` on evaluate API |

**Conversation table filters** do not change the agent scorecard totals on the card header—they filter which chats appear in the table; KPI row on **Conversation review** overview uses the same `summarizeMeasured` logic as PM when filters are “All.”

---

### 6D. One-line answers if they ask “why these metrics?”

- **Performance dashboard:** Volume + latency + sentiment tell you **operating** the channel; pass rate + rubric + decisions tell you **whether to ship or fix policy/engineering**.  
- **Conversation review:** Same rubric at **chat grain** so supervisors can **coach Priya** with evidence, not aggregate blame.  
- **80% coverage gate:** Prevents gaming with short, ungraded chats.  
- **Gated pass:** Prevents “sounds nice but leaked data / wrong ticket” from counting as success.

---

## 7. Demo script (5 minutes)

1. **Landing** → pick **Rohan** (overdue jacket refund, P1).  
2. **Speak or type** a frustrated refund complaint (Hindi or English).  
3. Point out: **intro as Priya**, empathy, **auto ticket** (no “say yes”), ticket ID in reply.  
4. Ask **“What will happen with that?”** → stays in context.  
5. End conversation → quick feedback.  
6. **Performance dashboard** → show charts (volume, latency stages, sentiment, decisions); hover info icons.  
7. **Conversation review** → open scorecard / coaching queue; open full review for one chat.  
8. Optional: **Agent settings** → change empathy/tone → *new* chat only.

---

## 8. Likely interview Q&A

**Q: Why not let the LLM decide everything?**  
A: Support needs **auditable policy**. LLM does phrasing; rules + fixtures own facts and actions. Safer and scoreable.

**Q: How do you know the agent is “good enough” to ship?**  
A: Gated pass rate on live scored chats, CSAT/resolution, latency P95, and zero critical action-safety fails—not average fluency.

**Q: What would you build next in production?**  
A: Durable DB, real ticket/OMS integration, sampling + calibration for human QA, cost/token dashboards, A/B on Care scripts with frozen style, alert on P95 latency and escalating-share spikes.

**Q: What’s the hardest PM tradeoff you made?**  
A: Auto-ticket vs confirmation UX—confirmation felt “safer” but confused users and delayed critical remediation. We chose **inform + act** for P1 overdue, matching call-centre practice.

**Q: Latency?**  
A: Shortened spoken utterances, brisker TTS instructions, speech prefetch where useful; observability shows which stage dominates (often TTS/model).

---

## 9. Resume bullet (PM, ~2 lines)

**VelaWear Voice Care** — Shipped a bilingual (EN/HI) AI voice support + quality demo on Next.js/Vercel (OpenAI STT/TTS): defined Care call-flow (intro, empathy, auto-ticket for P1/overdue, context-aware follow-ups), live sentiment/priority, and Performance + Conversation review dashboards with a gated rubric so agent quality is measurable end-to-end.

---

## 10. One-page cheat sheet (glance before you walk in)

| Topic | Say this |
|-------|----------|
| Product | Bilingual voice Care agent for returns/refunds + PM/Support quality layer |
| Differentiator | Deterministic policy + LLM phrasing; gated rubric, not vibes |
| Critical UX | Auto-ticket on P1; Care intro; context follow-ups |
| Dashboards | Performance dashboard (graphs/decisions) vs Conversation review (coaching) |
| Tech | Next.js, OpenAI STT/TTS, rules/fixtures, Vercel |
| Metrics | §6: why + thresholds (60% pass, 80% coverage, 80% CSAT target) + formulas per dashboard |
| Honesty | Demo fixtures/mock tickets; production would add OMS + durable store |

Good luck—lead with the **Care policy decisions** and **how you measure quality**; tech is the how, not the hero.
