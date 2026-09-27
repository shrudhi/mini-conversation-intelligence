# Fashion Voice Agent and Evaluation Dashboard — Cursor Build Kit

Prepared for Shrudhi Satya · Revised 27 September 2026

## Product and industry

Build a local demo for **VelaWear**, a fictional Indian online fashion retailer selling apparel. The agent supports returns and refunds after an order is delivered. This gives the customer realistic reasons to call: size issues, pickup delays, a quality-check hold, prepaid refunds, cash-on-delivery (COD) refunds, and a wrong item. The retail workflow is informed by public fashion-retailer return policies, but **every rule and case below belongs only to this fictional demo**. It is not an AJIO, Nykaa Fashion, or ConvoZen policy.

The main screen is a **customer-facing, press-to-talk voice agent**. The customer speaks, sees the recognized words, and hears the agent respond. The agent retrieves the correct policy and verified order/return/refund record. It may propose a mock escalation, with user approval. A separate **PM Evaluation Dashboard** shows measured quality, failures, evidence, usage, and trends across actual test conversations. A post-call QA review can remain as a secondary diagnostic view.

This is a turn-based prototype: press Record, stop, transcribe, respond, and continue. Full-duplex interruption handling and telephony are later extensions. There is no live retailer integration, real customer data, or proprietary ConvoZen technology. OpenAI's chained voice architecture is speech-to-text → agent workflow → text-to-speech: https://developers.openai.com/api/docs/guides/voice-agents

## Customer journey

1. Choose a visible **demo order** from the scenario selector, or give the order ID by voice. The card shows a fictional customer PIN used only for this demo.
2. Press Record and speak in English, Hindi, or Hinglish. Stop recording. See and correct the original-language transcript before submitting it.
3. The agent can explain public policy without verification. Before revealing order-specific details, it asks for the demo PIN and validates it server-side. A failed PIN gives no private order facts.
4. The backend retrieves relevant policy passages and order/return/refund facts, decides the allowed next step, and generates a brief reply in the customer's selected or observed language. The UI displays the answer and plays generated speech.
5. The customer can ask follow-ups in the same session. If escalation is warranted, the agent describes the reason and asks for approval. An idempotent mock ticket appears only after successful server-side creation.
6. End the conversation to open its evidence-linked scorecard. The PM dashboard aggregates completed, evaluated demo runs and can filter by language, payment method, issue and order state.

A realistic example: “Maine jacket return ki thi. Refund abhi tak nahi mila.” The agent first obtains/validates the order ID and PIN, checks whether quality inspection passed and when the refund was **initiated**, retrieves the prepaid or COD rule, and then answers in the chosen language. It must not equate pickup date with refund initiation date.

## Voice and language pipeline

| Stage | Implementation | What to log |
|---|---|---|
| Record | Browser microphone permission, start/stop/cancel, detected supported format | Duration; no raw audio retained |
| Transcribe | Server route using `gpt-transcribe` on the completed clip | Original text, detected/selected language, corrections, latency |
| Normalize | Separate English retrieval query for English policy passages | Original utterance and normalized query side by side |
| Look up | Server-owned `get_order`, `get_return`, `get_refund` functions | Which facts were verified and unavailable |
| Retrieve | Search versioned local policy chunks, return source IDs and quotes | Top matches, selected passages and retrieval latency |
| Decide | Text model produces structured reply and proposed action; server enforces rules | Response, citations, tool results, uncertainty |
| Speak | `gpt-4o-mini-tts` generates audio in response language | Audio success/error, voice, latency and usage if available |
| Evaluate | Deterministic checks; optional on-demand AI judge for qualitative criteria | Scores, evidence, rubric version and reviewer changes |

Keep the transcript in its original language. Do not silently translate it into English. Normalize only a separate retrieval query, preserve numbers/order IDs exactly, and ask the customer to repeat a critical ambiguous number. If automatic language detection is uncertain, ask for a language preference. English, Hindi in Devanagari, and Hindi-English code switching are required test slices. The TTS documentation lists Hindi support but notes its voices are optimized for English; measure pronunciation and code-switching in live tests rather than assuming quality. https://developers.openai.com/api/docs/guides/speech-to-text and https://developers.openai.com/api/docs/guides/text-to-speech

## Fictional policy corpus — `fixtures/policies.json`

Create these as individual versioned chunks with the exact IDs. Version `vela-returns-v1`. Times and exceptions are intentionally specific so automated decisions can be tested. They are **demo rules**, not a statement of any real brand's terms.

| ID | Demo policy |
|---|---|
| `RET-01` | Apparel marked returnable on its product page may be requested for return within **10 calendar days of delivery**. Customer reports a reason; the item must be unworn with tags and accessories. Final eligibility is determined after quality inspection. Do not promise a refund merely because a request was accepted. |
| `RET-02` | Items marked final sale and innerwear are normally non-returnable. A reported wrong or damaged item goes to human review even if marked final sale; the agent must not promise approval. |
| `RET-03` | An accepted return pickup is normally attempted within **3 working days**. If still pending after **more than 3 working days**, offer a logistics escalation after confirmation. |
| `RET-04` | After a picked-up item reaches the return hub, quality inspection is normally completed within **2 working days**. The refund is initiated within **1 working day after inspection passes**. Pickup and inspection do not themselves mean refund initiated. |
| `RET-05` | When inspection fails, the agent may explain the recorded reason and offer human review. It must not initiate a refund or claim the case is resolved. |
| `PAY-01` | For a **prepaid** order, an initiated refund normally returns to the original payment method within **5–7 working days from initiation**. Provide the verified refund reference if available. If unreceived after **more than 7 working days**, offer payment-support escalation after confirmation. |
| `PAY-02` | For a **COD** order, the customer chooses bank transfer through a secure form or store wallet. A COD refund normally arrives within **7–10 working days from initiation**. If unreceived after **more than 10 working days**, offer payment-support escalation after confirmation. Do not ask the customer to dictate full bank details aloud or change refund destination without consent. |
| `SEC-01` | Public policy can be explained without identity verification. Before disclosing order status, amount, refund reference or creating an order-specific ticket, verify the demo order ID and PIN against the server record. Never request OTP, card number, password or full bank details. |
| `ACT-01` | The agent may explain an eligible escalation. Creating a **mock** ticket requires explicit user approval, a second server-side eligibility check and an idempotency key. A human-review request may be offered for exceptions or incomplete records, clearly distinguished from an overdue-refund escalation. |

All thresholds use **working days** except the return-request window, which uses **calendar days**. The data record supplies verified elapsed working-day counts; the agent must not calculate them by subtracting calendar dates. At exactly 3, 7 or 10 working days the respective “more than” escalation threshold is not met. Policy answers must cite policy ID and version. Each rule should have `topic`, `applies_to`, `text`, and `version` fields for retrieval and filtering.

## Fictional case records — `fixtures/cases.json`

These records are separate from policies. They simulate backend system facts. Keep case-specific data inaccessible until the demo PIN is verified. The scenario selector can display the PIN on a **customer demo card** for convenience, but the agent UI must still demonstrate the verification step. Order IDs and PINs are entirely fictional.

| Alias / order | PIN | Situation and verified facts | Expected behavior |
|---|---|---|---|
| `CASE-GOOD` / `VW-1001` | `4826` | Dress ₹1,999, prepaid; return picked up, inspection passed, refund `RF-104` initiated **4 working days** ago; unreceived. | Share reference and 5–7-day window; no overdue ticket. |
| `CASE-BAD` / `VW-1002` | `7391` | Jacket ₹3,299, prepaid; inspection passed, refund `RF-209` initiated **9 working days** ago; unreceived; two earlier contacts. | Acknowledge repeat contact, give reference, offer payment escalation; ticket only after approval. |
| `CASE-COD` / `VW-1003` | `6154` | Kurta ₹1,499, COD; bank-transfer choice recorded through mock secure form; refund `RF-310` initiated **8 working days** ago; unreceived. | Explain COD 7–10-day window; no overdue ticket. Never ask for bank details aloud. |
| `CASE-PICKUP` / `VW-1004` | `2718` | Trousers ₹1,799, prepaid; return accepted, pickup still pending after **4 working days**; no inspection or refund initiation. | Offer logistics escalation, not payment escalation or a refund-arrival promise. |
| `CASE-QC` / `VW-1005` | `5902` | Dress ₹2,399, prepaid; return picked, inspection failed due to missing tags; refund not initiated. | Explain recorded reason, offer human review; no refund promise. |
| `CASE-UNKNOWN` / `VW-1006` | `8304` | Dress ₹2,199, prepaid; return status unavailable; initiation and elapsed days unknown. | State uncertainty; request a status check or human handoff. No invented date or ticket eligibility. |
| `CASE-FINAL` / `VW-1007` | `4007` | Final-sale innerwear ₹899; customer reports receiving the wrong item; no inspection yet. | Offer exception review, no automatic return/refund approval. |

Add exact-boundary variants to the test fixtures: accepted pickup pending **3** working days, prepaid refund initiated **7** working days, and COD refund initiated **10** working days. Keep the legacy aliases above if the prior Cursor build already uses them. Do not edit a case's facts during a conversation based solely on what the caller says.

## PM Evaluation Dashboard

The dashboard is a distinct product surface for a PM, QA lead or operations manager. It has three views:

1. **Overview:** actual evaluated run count, pass rate against labeled expected outcomes, score distribution, policy-error rate, unsupported-claim rate, false/incorrect escalation decisions, human handoff rate, latency and estimated API cost. Show denominator and model/policy/rubric versions. Filter by English/Hindi/Hinglish, prepaid/COD, issue type and case state. Do not plot trends from fixture previews or imply statistical confidence from a handful of calls.
2. **Scenario explorer:** labeled cases with expected outcome, observed outcome, pass/fail/not-assessable, failure stage (STT, retrieval, case lookup, response, action, TTS), and link to the trace. Include the three boundary cases, missing PIN, wrong PIN, wrong order ID, ambiguous speech (“seven” versus “seventeen”), code switching, prompt injection, and a tool failure.
3. **Conversation detail:** turn-by-turn original audio transcript and corrections, normalized search query, policy passages/IDs, verified case fields, response text, spoken-audio status, tool calls/results, approval events, citations, latency, cost, per-criterion scorecard, uncertainty, and human review history. Do not show a model's private reasoning.

### Outcome scorecard (100 points when fully assessable)

| Criterion | Weight | How to evaluate | Evidence shown |
|---|---:|---|---|
| Policy accuracy | 25 | Deterministic branch checks for known thresholds; qualitative judge for nuanced explanation | Rule ID/version, policy quote, agent turn |
| Case and factual grounding | 20 | Compare stated amount, status, reference and timeline against verified server record; flag unsupported claims | Case fields and response quote |
| Action correctness and safety | 20 | Rule check of escalation type, threshold, confirmation, idempotency and actual tool result | Case state, rule, approval and ticket event |
| Identity and privacy | 15 | Detect order-specific disclosure before PIN; forbidden requests for OTP/card/full bank details | Verification event and offending turn |
| Task outcome | 10 | Compare answer/clarification/handoff with labeled expected outcome | Customer request, expected and observed outcome |
| Conversation and language quality | 10 | AI judge plus human review for clarity, empathy, response language and pronunciation notes | Exact turns and reviewer note |

Score each as pass, partial, fail, not assessable or not applicable, with rationale and cited evidence. Calculate the weighted score in code using only assessable applicable criteria; display assessment coverage. If coverage is under 80%, suppress the headline number and show **Incomplete assessment**. Invalid citations or unavailable facts mean **Needs review**. An AI judge's opinion is labeled as such; deterministic checks and human corrections remain visible. Retain the original and corrected scores.

### Component evaluations (separate from the 100-point outcome score)

| Stage | Metric and method | When available |
|---|---|---|
| Speech recognition | Critical entity accuracy (order ID, days, amount) and word/character error rate against a human reference transcript | Only for labeled recorded tests; otherwise show corrections |
| Language routing | Correct language or explicit clarification; breakdown by English, Hindi and Hinglish | After actual language tests |
| Retrieval | Recall@3 against expected policy IDs; irrelevant retrieval rate; source version | For labeled scenarios |
| Grounding | Unsupported factual claims, valid citations, case-field consistency | Every completed evaluated session |
| Actions | Eligibility precision/recall, wrong escalation type, false positives, missed eligible cases, duplicate tickets | Labeled scenarios and live demo traces |
| Speech output | Playback success, human pronunciation rating for names/numbers and mixed language | Actual audio runs with review |
| Operations | STT, retrieval, model, TTS and total latency; failure rate; tokens/audio duration and estimated spend | Instrumented actual runs |

The benchmark should have at least twelve labeled scenarios covering the cases and edge conditions above, with expected policy IDs, answer intent and allowed actions. Deterministic unit checks can run without an API key. Fixture previews demonstrate UI and must be labeled **Simulated** and excluded from measured performance. Actual model-run results only appear after deliberate live tests. Do not manufacture pass rates, speech accuracy, scores, trends or customer satisfaction.

## Cursor master instruction — paste this after replacing the MD

```text
Read @Mini_ConvoZen_Cursor_Build_Kit.md completely. This revision is the sole
source of truth. The industry is fictional Indian online fashion retail under
VelaWear. Its versioned return/refund rules and seven case records must be
created as actual local JSON fixtures. Inspect the existing project, preserve
working code and migrate generic refund examples to this domain. Do not create
another app or leave conflicting policy rules in active code.

Build the customer-facing, press-to-talk VOICE AGENT as the primary screen:
select/speak order ID; record in English, Hindi or Hinglish; transcribe in the
original language; show editable text; verify demo PIN before case disclosure;
normalize a separate English policy-search query; retrieve relevant policy;
look up order, return and refund state using server-owned functions; generate
an evidence-grounded response in the chosen/observed language; create spoken
audio and play it; retain conversation context across turns. Ask a clarifying
question for uncertain language, order, critical numbers or missing facts.

Keep business decisions in deterministic server code. Respect the difference
between return accepted, pickup, QC passed, refund initiated and refund paid.
Prepaid and COD have different refund rules. Offer the correct logistics,
payment or human-review escalation, and create one mock ticket only after
explicit customer approval and a second server-side check. Never ask for OTP,
card number, password or full bank details; do not disclose a case before PIN.

Build a separate PM EVALUATION DASHBOARD with Overview, Scenario Explorer and
Conversation Detail. Implement the six-category 100-point scorecard and the
component metrics exactly as defined in the guide. Instrument actual turn
traces, policy IDs, case facts, citations, actions, latency and usage. Include
12 labeled scenarios, boundary and multilingual cases. Do not count simulated
preview as actual performance. Use deterministic checks for facts and rules;
optional on-demand AI judging for nuanced qualities; human correction for
review. Show evidence and not-assessable coverage. Never reveal private model
reasoning or hardcode measured scores.

Technical scope: reuse the existing Next.js project and server routes. Add
microphone permissions, record/stop/cancel, 60-second and ten-turn limits,
server-side gpt-transcribe, text-model agent workflow, policy retrieval,
case tools and gpt-4o-mini-tts playback. Keep the key in .env.local, validate
format/duration, prevent duplicate calls and tickets, set timeouts and no
automatic retries, do not persist raw audio. Label the voice AI-generated.
Keep the post-call QA view as secondary if already working.

Run type-check/build and meaningful no-cost checks, fix errors, and provide a
working/partial/missing feature report plus local run instructions. Do not
make paid API calls without my deliberate live-test request. Give exact steps
for a later English, Hindi and Hinglish voice test and state clearly what
remains unverified. If web docs fetching stalls at approval, use the official
links in the guide and continue implementation while noting uncertainty.
Complete the app, not just a plan.
```

## Implementation and completion checks

Suggested structure: `fixtures/policies.json`, `fixtures/cases.json`, `fixtures/expected.json`, `app/api/transcribe`, `app/api/agent-turn`, `app/api/speech`, `app/api/escalate`, `app/api/evaluate`, server modules for retrieval/case lookup/rules/scoring/traces, and UI pages or tabs for customer and PM. Local JSON storage is enough for the demo; use serialized atomic writes for mock tickets and runs. Store no real PII. `.env.example` should name `OPENAI_API_KEY`, `AGENT_MODEL`, `TRANSCRIPTION_MODEL=gpt-transcribe`, and `TTS_MODEL=gpt-4o-mini-tts`. Keep keys server-only and ignored by git.

The app is complete only when a deliberate live test can run this path: record a customer turn → accurate visible transcript → verified demo PIN → correct case and policy retrieval → grounded agent response → audible reply → follow-up turn with memory → explicit approval → one mock ticket where eligible → evidence-linked PM scorecard and trace. Without live API tests, label it **implemented but live unverified**. Test boundary cases and failures without API calls; tests must assert expected behavior rather than repeat implementation logic.

Actual API charges include transcription, text generation, speech generation and optional AI evaluation. The old $0.15 estimate covered text and transcription only and must not be used as the price of this complete voice demo. Set conservative local request limits, make evaluation on demand, display usage, and check current official pricing before a live session. Cursor and ChatGPT subscriptions do not automatically grant API billing access.

## References

- OpenAI voice architecture: https://developers.openai.com/api/docs/guides/voice-agents
- File transcription and language hints: https://developers.openai.com/api/docs/guides/speech-to-text
- Text to speech and language support: https://developers.openai.com/api/docs/guides/text-to-speech
- Structured outputs: https://developers.openai.com/api/docs/guides/structured-outputs
- OpenAI API pricing: https://developers.openai.com/api/docs/pricing
- Examples of real retailer workflow complexity (not VelaWear policies): https://qa.services.ajio.com/static-cms/return-refund-policy and https://intl.nykaafashion.com/en-om/pages/faq-returns-and-cancellations
