# VelaWear voice agent

A local press-to-talk demo for **VelaWear**, a fictional Indian online fashion retailer. The customer records a turn, reviews the transcript, and sends it. The agent checks the demo PIN, reads the local order and return policy, replies in English, Hindi, or Hinglish, and can speak the answer. A separate PM Evaluation Dashboard scores completed conversations.

The rules and orders are invented for this exercise. They are not an AJIO, Nykaa Fashion, or ConvoZen policy.

No paid API call is made unless you add your own key and use Record, Send on a live turn, speech, or the AI judge.

## Start locally

```bash
npm install
npm test
npm run typecheck
npm run build
npm run dev
```

Open the localhost URL printed by `npm run dev`. Copy `.env.example` to `.env.local` only when you want a live voice test. Put the key in `OPENAI_API_KEY`. Do not prefix it with `NEXT_PUBLIC_`. Restart the dev server after changing environment variables.

Without a key, typed messages still get a **Simulated** reply from the local rules. Recording, speech, and the AI judge stay disabled. Simulated replies and fixture previews are not measured performance.

## Customer screen

1. Choose a demo order. The card shows the fictional PIN.
2. Choose English, Hindi, or Auto.
3. Press Record, then Stop. The transcript appears for correction. Nothing is sent yet.
4. Press Send. The agent asks for the PIN before sharing order status, amount, or a refund reference.
5. Approve a mock escalation only when the agent asks. A second approval returns the same ticket.
6. End the conversation to open its scorecard.

Mute stops automatic playback. Replay plays the last generated clip. Cancel discards the recording or the unsent transcript. The English policy-search query is stored on the trace, not in the chat.

## PM Evaluation Dashboard

Overview shows only evaluated live runs: pass rate, the six-category scorecard rates, language counts, failures, latency, and token or audio usage. It does not estimate a dollar cost and does not treat a handful of calls as a confidence interval.

Scenario explorer lists the labeled cases, including the 3, 7, and 10 working-day boundaries, missing PIN, wrong PIN, wrong order, ambiguous numbers, Hinglish, Hindi, prompt injection, and a tool failure. Those rows are marked **Simulated**.

Conversation detail is the post-call review: original transcript, corrections, search query, policy quotes, tool facts, reply, speech status, approval, citations, latency, and the scorecard. Language quality stays not assessable until a human note or an explicit AI judge. Invalid citations show **Needs review**. Coverage under 80% shows **Incomplete assessment**.

## What each part does

`app/api/transcribe` checks format, size, and duration, then calls `gpt-transcribe`. Audio is not saved.

`app/api/agent-turn` keeps the conversation, verifies the PIN, retrieves policy, and looks up the order, return, and refund. Business rules stay in server code. A text model may phrase the approved reply when a key is present; a failed safety check keeps the local reply.

`app/api/speech` calls `gpt-4o-mini-tts` for a stored reply and labels the audio AI-generated.

`app/api/escalate` creates one mock ticket after approval and a second eligibility check.

`app/api/evaluate` scores a finished conversation and serves the dashboard. The AI judge runs only when requested.

## Limits

- 10 customer turns, 60-second recordings, 10 MB audio
- 20 agent calls, 10 transcriptions, and 20 speech calls per server process
- One provider request at a time, no automatic retries
- Fixture previews do not use those counters

## Live test, after you add a key

Check current OpenAI pricing first. A full voice turn can charge for transcription, the text reply, speech, and an optional judge. Do not treat an older text-only estimate as the price of this demo.

1. Restart `npm run dev` after saving `.env.local`.
2. English: select VW-1001, choose English, say that the refund has not arrived, stop, correct the text, send, then say PIN 4826. Expect RF-104, 4 working days, and the 5–7 day window, with no ticket.
3. Hindi: select the same order, choose Hindi or Auto, speak a Devanagari refund question, then the PIN. Confirm the reply stays in Hindi and the spoken audio is understandable.
4. Hinglish: select VW-1002 and say “Maine jacket return ki thi. Refund abhi tak nahi mila.” After PIN 7391, expect RF-209 and an approval request. Approve once and confirm a single mock ticket.
5. End each conversation and confirm the dashboard counts only those live runs. Leave the AI judge unused unless you intend that extra call.

Pronunciation of Hindi and code-switching is unverified until you listen to those clips. Boundary cases, wrong PIN, and the tool-failure path are covered by `npm test` without a provider call.

## Checks in this workspace

`npm test` covers retrieval, language routing, PIN gating, boundary days, approval idempotency, injection, tool failure, the labeled scenarios, score coverage, and audio limits. It does not call OpenAI.

Live transcription, model phrasing, and speech playback are implemented but were not executed here.
