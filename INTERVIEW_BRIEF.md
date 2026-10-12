# VelaWear Voice Care — Interview brief (Product Manager)

Use this as your talking script. Speak in **outcomes and decisions**, then drop one technical detail to show depth.

**Local demo:** http://localhost:3000 (`npm run dev`)  
**Live:** your Vercel deploy of this repo  
**Role framing:** You owned the product problem, agent policy, quality metrics, and PM/Support dashboards; engineering implemented on Next.js + OpenAI.

---

## 1. Elevator pitch (30–45 seconds)

> I built **VelaWear**, a bilingual (English/Hindi) **AI voice support demo** for a fictional Indian fashion brand. Customers talk by text or press-to-talk about returns and refunds. The agent behaves like a **call-centre Care agent**—introduces itself, stays empathetic, auto-creates tickets on critical overdue cases, and keeps context on follow-ups.  
> As PM I also shipped an **observability layer** (volume, latency, sentiment, pass rate, CSAT) and a **Conversation review** workspace so supervisors can score chats on a gated rubric—not just “looks fluent.”  
> Stack: **Next.js, OpenAI STT/TTS + phrasing, deterministic policy/rules engine, JSON fixtures, Vercel.**

---

## 2. Problem we solved

| Pain | Product response |
|------|------------------|
| Voice bots sound scripted / reset context | Care-style intro (“Priya from VelaWear Care”), empathy, context-aware follow-ups |
| Bots ask users to confirm tickets they don’t understand | **Auto-ticket** for P1 / overdue / escalating; inform customer of ticket ID |
| “AI quality” is vague | **6-criterion rubric** with gates; incomplete scores if coverage &lt; 80% |
| PMs can’t decide what to fix | **PM observability** charts + recommended product decisions with evidence |
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
1. **PM observability** — decision / ops layer  
   Volume, pass-rate trend, latency trend + stage breakdown (STT / retrieval / model / TTS), language mix, sentiment mix, ticket mix, issue focus, rubric strength, product decisions, CSAT / resolution / ticket rate / P95 latency
2. **Conversation review** — agent evaluation for support leads  
   Priya scorecard (pass rate, avg score, CSAT, resolution, needs review), **coaching queue**, conversation table, criterion scorecard, human language review / optional AI judge

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
- PM → *what to ship / fix next* (observability + decisions)  
- Support → *coach this agent on this chat* (QA queue + rubric)

### G. Honest demo boundaries
Mock tickets (`CARE-…` display), fixture customers, no real payments/PII. Good to say: “I’d replace fixtures with OMS + durable store for production.”

---

## 6. Metrics you should be able to explain

### Quality rubric (weights)
| Criterion | Weight | What it protects |
|-----------|--------|------------------|
| Policy accuracy | 25 | Right rules / citations |
| Case grounding | 20 | No invented facts / cross-customer leaks |
| Action safety | 20 | Safe, correct tickets / approvals |
| Identity & privacy | 15 | No OTP/PIN fishing on signed-in users |
| Task outcome | 10 | Did we resolve the ask? |
| Language quality | 10 | Natural Care tone (often human/AI reviewed) |

**Pass rule:** Published headline score **and** no fail on gated criteria. Coverage under ~80% → **incomplete** (don’t fake a launch-ready score).

### Ops / PM KPIs (observability)
- Conversations / ended volume  
- **Pass rate** (product launch bar)  
- **CSAT** & customer-reported **resolution**  
- **Ticket rate** / handoff rate  
- **Median & P95 latency**; stage split STT / model / TTS  
- Language mix, sentiment mix (escalating share), issue focus  
- Recommended **product decisions** from failure patterns  

### Conversation review KPIs
- Agent pass rate, avg score  
- Needs-review count, language reviews  
- Coaching queue by priority  

---

## 7. Demo script (5 minutes)

1. **Landing** → pick **Rohan** (overdue jacket refund, P1).  
2. **Speak or type** a frustrated refund complaint (Hindi or English).  
3. Point out: **intro as Priya**, empathy, **auto ticket** (no “say yes”), ticket ID in reply.  
4. Ask **“What will happen with that?”** → stays in context.  
5. End conversation → quick feedback.  
6. **PM observability** → show charts (volume, latency stages, sentiment, decisions).  
7. **Conversation review** → open scorecard / coaching queue for that chat.  
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

**VelaWear Voice Care** — Shipped a bilingual (EN/HI) AI voice support + quality demo on Next.js/Vercel (OpenAI STT/TTS): defined Care call-flow (intro, empathy, auto-ticket for P1/overdue, context-aware follow-ups), live sentiment/priority, and PM observability + Conversation review dashboards with a gated rubric so agent quality is measurable end-to-end.

---

## 10. One-page cheat sheet (glance before you walk in)

| Topic | Say this |
|-------|----------|
| Product | Bilingual voice Care agent for returns/refunds + PM/Support quality layer |
| Differentiator | Deterministic policy + LLM phrasing; gated rubric, not vibes |
| Critical UX | Auto-ticket on P1; Care intro; context follow-ups |
| Dashboards | PM observability (graphs/decisions) vs Conversation review (coaching) |
| Tech | Next.js, OpenAI STT/TTS, rules/fixtures, Vercel |
| Metrics | Pass rate, CSAT, resolution, latency P95, ticket/handoff, criterion health |
| Honesty | Demo fixtures/mock tickets; production would add OMS + durable store |

Good luck—lead with the **Care policy decisions** and **how you measure quality**; tech is the how, not the hero.
