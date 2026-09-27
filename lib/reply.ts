import { POLICY_VERSION, type EscalationType } from "./constants";
import { formatInr, policyQuote } from "./cases";
import { detectConversationIntent, ticketLabel, type ConversationIntent, type IssueFocus, type LiveSentiment } from "./intent";
import type { CaseRecord, Citation, ReplyLanguage } from "./types";
import type { CaseDecision } from "./rules";
import type { RankedPolicy } from "./retrieve";

export type ReplyContext = {
  customerText: string;
  disclosedBefore: boolean;
  ticketId: string | null;
  ticketType: EscalationType | null;
  intent: ConversationIntent;
  priorTurns?: Array<{ customerText: string; responseText: string; disclosed: boolean }>;
};

export function citationsFor(ids: string[]): Citation[] {
  return ids.map((policyId) => ({
    policyId,
    version: POLICY_VERSION,
    quote: policyQuote(policyId),
  }));
}

export function composeReply(input: {
  language: ReplyLanguage;
  kind:
    | { type: "turn_limit" }
    | { type: "ask_language" }
    | { type: "ask_pin"; orderId: string | null }
    | { type: "ask_order" }
    | { type: "bad_pin"; orderId: string }
    | { type: "unknown_order"; orderId: string }
    | { type: "injection" }
    | { type: "tool_failure" }
    | { type: "human_agent"; canOffer: boolean; escalation: EscalationType | null }
    | { type: "public"; policies: RankedPolicy[] }
    | { type: "case"; record: CaseRecord; decision: CaseDecision }
    | { type: "ticket"; ticketId: string; created: boolean; escalation: EscalationType }
    | { type: "ticket_refused"; reason: string }
    | { type: "ticket_status"; ticketId: string; escalation: EscalationType; reference?: string | null }
    | { type: "next_steps"; ticketId: string; escalation: EscalationType; reference?: string | null; asksFixedDate?: boolean }
    | { type: "declined" }
    | { type: "greeting" }
    | { type: "unrelated" }
    | { type: "unclear" }
    | { type: "profile_switch"; selectedName: string; mentionedName: string };
  ambiguous: boolean;
  context?: Partial<ReplyContext>;
}): { text: string; citations: Citation[]; uncertainties: string[] } {
  const { language, kind } = input;
  const intent = input.context?.intent ?? detectConversationIntent(input.context?.customerText ?? "");
  let text = "";
  let citations: Citation[] = [];
  const uncertainties: string[] = [];

  if (kind.type === "turn_limit") {
    text = say(language, {
      en: "We've reached the turn limit for this chat. Please end the conversation to open the scorecard, then start a new one if you still need help.",
      hi: "इस बातचीत की सीमा पूरी हो गई है। स्कोर देखने के लिए बातचीत खत्म करें, फिर जरूरत हो तो नई शुरू करें।",
      hinglish: "Is chat ki limit poori ho gayi hai. Scorecard ke liye end kijiye, phir zarurat ho to nayi shuru kijiye.",
    });
  } else if (kind.type === "ask_language") {
    text =
      "कृपया बताइए: English, हिंदी, या Hinglish? Please choose English, Hindi, or Hinglish.";
    uncertainties.push("Language detection was uncertain, so no order details were shared.");
  } else if (kind.type === "ask_pin") {
    const order = kind.orderId ? ` ${kind.orderId}` : "";
    text = say(language, {
      en: `I can help with your signed-in order${order}. What would you like to know about the status?`,
      hi: `मैं आपके साइन-इन ऑर्डर${order} में मदद कर सकती हूँ। स्थिति के बारे में क्या जानना है?`,
      hinglish: `Main aapke signed-in order${order} mein madad kar sakti hoon. Status ke baare mein kya jaanna hai?`,
    });
    citations = citationsFor(["SEC-01"]);
  } else if (kind.type === "ask_order") {
    text = say(language, {
      en: "Please tell me your order ID, for example VW-1001, so I can open the matching signed-in case.",
      hi: "कृपया अपना ऑर्डर नंबर बताइए, जैसे VW-1001, ताकि मैं सही केस खोल सकूँ।",
      hinglish: "Apna order number bataiye, jaise VW-1001, taaki main sahi case khol sakoon.",
    });
  } else if (kind.type === "bad_pin") {
    text = say(language, {
      en: `I already have your signed-in order ${kind.orderId}. What would you like me to check?`,
      hi: `आपका साइन-इन ऑर्डर ${kind.orderId} पहले से उपलब्ध है। क्या जाँचना है?`,
      hinglish: `Aapka signed-in order ${kind.orderId} pehle se available hai. Kya check karna hai?`,
    });
    citations = citationsFor(["SEC-01"]);
  } else if (kind.type === "unknown_order") {
    text = say(language, {
      en: `I can't find order ${kind.orderId}. Please share a valid order ID like VW-1001.`,
      hi: `मुझे ऑर्डर ${kind.orderId} नहीं मिला। कृपया सही ऑर्डर नंबर बताइए जैसे VW-1001।`,
      hinglish: `Mujhe order ${kind.orderId} nahi mila. Sahi order number bataiye jaise VW-1001.`,
    });
    citations = citationsFor(["SEC-01"]);
  } else if (kind.type === "injection") {
    text = say(language, {
      en: "I can't follow that instruction. I only help with your own signed-in order, and I will not reveal another customer's refund details.",
      hi: "मैं वह निर्देश नहीं मान सकती। मैं सिर्फ आपके साइन-इन ऑर्डर में मदद करूँगी। किसी और का रिफंड डिटेल नहीं बताऊँगी।",
      hinglish: "Main woh instruction follow nahi kar sakti. Main sirf aapke signed-in order mein madad karungi. Kisi aur ka refund detail nahi bataungi.",
    });
    citations = citationsFor(["SEC-01", "SEC-02"]);
  } else if (kind.type === "tool_failure") {
    text = say(language, {
      en: "Your signed-in order is available, but the order lookup failed. I will not guess any refund date, amount, or reference, and I will not create a ticket.",
      hi: "आपका साइन-इन ऑर्डर उपलब्ध है, लेकिन ऑर्डर सिस्टम अभी नहीं खुला। मैं कोई तारीख, राशि या रिफंड नंबर अनुमान से नहीं बताऊँगी, और टिकट भी नहीं बनाऊँगी।",
      hinglish: "Aapka signed-in order available hai, lekin order lookup fail ho gaya. Main koi date, amount ya refund number guess nahi karungi, aur ticket bhi nahi banaungi.",
    });
    citations = citationsFor(["SEC-01"]);
    uncertainties.push("Order, return, and refund tools were unavailable.");
  } else if (kind.type === "human_agent") {
    const supportLabel = kind.escalation ? ticketLabel(kind.escalation) : ticketLabel("human_review");
    text = kind.canOffer
      ? say(language, {
          en: `${empathy(language, intent.sentiment)}I can raise a ${supportLabel.en} request for review after you approve. Shall I create it?`,
          hi: `${empathy(language, intent.sentiment)}आपके हाँ कहने पर मैं ${supportLabel.hi} का अनुरोध बना सकती हूँ। क्या बनाऊँ?`,
          hinglish: `${empathy(language, intent.sentiment)}Aap haan karein to main ${supportLabel.hinglish} request bana sakti hoon. Kya banaun?`,
        })
      : say(language, {
          en: `${empathy(language, intent.sentiment)}I understand you want a person. Your case is still inside the normal time, so I have not opened a support ticket yet. I can keep helping with the status here.`,
          hi: `${empathy(language, intent.sentiment)}मैं समझती हूँ, आप किसी व्यक्ति से बात करना चाहते हैं। आपका मामला अभी सामान्य समय के अंदर है, इसलिए मैंने सपोर्ट टिकट नहीं बनाया। मैं यहाँ स्थिति में मदद कर सकती हूँ।`,
          hinglish: `${empathy(language, intent.sentiment)}Main samajhti hoon aap person se baat karna chahte hain. Case abhi normal time ke andar hai, isliye ticket nahi banaya. Main yahan status mein madad kar sakti hoon.`,
        });
    citations = citationsFor(["ACT-01", "CX-01"]);
  } else if (kind.type === "public") {
    const top = kind.policies[0];
    if (!top) {
      text = say(language, {
        en: "I can help with returns, pickup, quality check, and refunds. If you want your own order status, select your customer profile or share your order ID.",
        hi: "मैं रिटर्न, पिकअप, क्वालिटी चेक और रिफंड में मदद कर सकती हूँ। अपना ऑर्डर स्टेटस चाहिए तो प्रोफ़ाइल चुनें या ऑर्डर नंबर बताइए।",
        hinglish: "Main return, pickup, quality check aur refund mein madad kar sakti hoon. Apna order status chahiye to profile choose karein ya order ID bataiye.",
      });
    } else {
      text = say(language, {
        en: `${top.quote} If you need your own order status, I can use your signed-in order.`,
        hi: `${simplePolicy(top.quote)} अगर अपना ऑर्डर स्टेटस चाहिए, तो मैं आपके साइन-इन ऑर्डर का उपयोग कर सकती हूँ।`,
        hinglish: `${simplePolicy(top.quote)} Agar apna order status chahiye, main aapke signed-in order ka use kar sakti hoon.`,
      });
      citations = kind.policies.slice(0, 2).map((policy) => ({
        policyId: policy.id,
        version: policy.version,
        quote: policy.quote,
      }));
    }
  } else if (kind.type === "declined") {
    text = say(language, {
      en: "Okay — I will not create a support ticket. Tell me if you want the timeline or anything else.",
      hi: "ठीक है — मैं सपोर्ट टिकट नहीं बनाऊँगी। अगर समयसीमा या और कुछ चाहिए तो बताइए।",
      hinglish: "Theek hai — main support ticket nahi banaungi. Timeline ya aur kuch chahiye to bataiye.",
    });
  } else if (kind.type === "greeting") {
    text = say(language, {
      en: "Hi, I'm the VelaWear support assistant. How can I help with your order?",
      hi: "नमस्ते, मैं VelaWear सपोर्ट असिस्टेंट हूँ। आपके ऑर्डर में कैसे मदद करूँ?",
      hinglish: "Hi, main VelaWear support assistant hoon. Aapke order mein kaise madad karoon?",
    });
  } else if (kind.type === "unrelated") {
    text = say(language, {
      en: "I can help with a VelaWear order, return, or refund. What would you like to know?",
      hi: "मैं VelaWear ऑर्डर, रिटर्न या रिफंड में मदद कर सकती हूँ। आप क्या जानना चाहते हैं?",
      hinglish: "Main VelaWear order, return ya refund mein madad kar sakti hoon. Aap kya jaanna chahte hain?",
    });
  } else if (kind.type === "unclear") {
    text = say(language, {
      en: "I didn't catch that. Could you say it again or type it?",
      hi: "मुझे समझ नहीं आया। क्या आप फिर से बोल सकते हैं या टाइप कर सकते हैं?",
      hinglish: "Mujhe samajh nahi aaya. Dobara boliye ya type kariye?",
    });
  } else if (kind.type === "profile_switch") {
    text = say(language, {
      en: `You're viewing ${kind.selectedName}'s demo profile. Please switch to ${kind.mentionedName}'s profile to check that case.`,
      hi: `आप ${kind.selectedName} की डेमो प्रोफ़ाइल देख रहे हैं। उस केस के लिए कृपया ${kind.mentionedName} की प्रोफ़ाइल चुनें।`,
      hinglish: `Aap ${kind.selectedName} ki demo profile dekh rahe hain. Us case ke liye please ${kind.mentionedName} ki profile choose karein.`,
    });
    citations = citationsFor(["SEC-02"]);
  } else if (kind.type === "ticket_refused") {
    text = say(language, {
      en: `I could not create the ticket. ${kind.reason}`,
      hi: `टिकट नहीं बन पाया। ${kind.reason}`,
      hinglish: `Ticket nahi ban paya. ${kind.reason}`,
    });
  } else if (kind.type === "ticket_status" || kind.type === "next_steps") {
    const label = ticketLabel(kind.escalation);
    const reference = "reference" in kind && kind.reference ? kind.reference : null;
    const asksFixedDate =
      ("asksFixedDate" in kind && kind.asksFixedDate) ||
      /\b(two days|2 days|next two days|by tomorrow|fixed date)\b/i.test(input.context?.customerText ?? "");
    const dateLine = asksFixedDate
      ? say(language, {
          en: " I can't promise the refund will arrive within two days — please stay with the normal policy window already shared.",
          hi: " मैं दो दिनों में रिफंड आने की गारंटी नहीं दे सकती — पहले बताई गई सामान्य समय-सीमा ही लागू है।",
          hinglish: " Main do din mein refund aane ki guarantee nahi de sakti — pehle batayi normal window hi apply hoti hai.",
        })
      : "";
    text = say(language, {
      en: `${empathy(language, intent.sentiment)}${cap(label.en)} ticket ${kind.ticketId} is already open${reference ? ` for refund ${reference}` : ""}. You do not need another request. Keep this ticket ID — the team will follow up from here.${dateLine}`,
      hi: `${empathy(language, intent.sentiment)}${label.hi} टिकट ${kind.ticketId}${reference ? ` रिफंड ${reference} के लिए` : ""} पहले से खुला है। नया अनुरोध नहीं चाहिए। यह टिकट आईडी रखें — टीम आगे फॉलोअप करेगी।${dateLine}`,
      hinglish: `${empathy(language, intent.sentiment)}${label.hinglish} ticket ${kind.ticketId}${reference ? ` refund ${reference} ke liye` : ""} pehle se open hai. Naye request ki zarurat nahi. Ticket ID rakhijiye — team follow-up karegi.${dateLine}`,
    });
    citations = citationsFor(["ACT-01", "CX-01"]);
  } else if (kind.type === "ticket") {
    const label = ticketLabel(kind.escalation);
    text = kind.created
      ? say(language, {
          en: `${empathy(language, intent.sentiment)}I've raised ${label.en} ticket ${kind.ticketId} for your refund. Our team will follow up from here. Please keep this ticket ID. Is there anything else you need right now?`,
          hi: `${empathy(language, intent.sentiment)}मैंने आपके रिफंड के लिए ${label.hi} टिकट ${kind.ticketId} बना दिया है। टीम आगे फॉलोअप करेगी। यह टिकट आईडी संभाल कर रखें। और कुछ चाहिए क्या?`,
          hinglish: `${empathy(language, intent.sentiment)}Maine aapke refund ke liye ${label.hinglish} ticket ${kind.ticketId} bana diya hai. Team follow-up karegi. Ticket ID save rakhijiye. Aur kuch chahiye kya?`,
        })
      : say(language, {
          en: `${empathy(language, intent.sentiment)}${cap(label.en)} ticket ${kind.ticketId} is already open for this refund. Our team is still reviewing it. You do not need another ticket.`,
          hi: `${empathy(language, intent.sentiment)}${label.hi} टिकट ${kind.ticketId} इस रिफंड के लिए पहले से खुला है। टीम अभी भी इसकी जाँच कर रही है। नए टिकट की जरूरत नहीं।`,
          hinglish: `${empathy(language, intent.sentiment)}${label.hinglish} ticket ${kind.ticketId} is refund ke liye pehle se open hai. Team abhi bhi review kar rahi hai. Naye ticket ki zarurat nahi.`,
        });
    citations = citationsFor(["ACT-01", "CX-01"]);
  } else {
    const rendered = renderCase(language, kind.record, kind.decision, {
      disclosedBefore: Boolean(input.context?.disclosedBefore),
      ticketId: input.context?.ticketId ?? null,
      ticketType: input.context?.ticketType ?? null,
      intent,
      customerText: input.context?.customerText ?? "",
    });
    text = rendered.text;
    citations = rendered.citations;
    uncertainties.push(...rendered.uncertainties);
  }

  if (input.ambiguous && kind.type !== "ask_language") {
    text = `${ambiguousLine(language)} ${text}`;
    uncertainties.push("A spoken number was ambiguous, so the verified record was used instead.");
  }

  return { text: makeCustomerFriendly(text), citations, uncertainties };
}

function renderCase(
  language: ReplyLanguage,
  record: CaseRecord,
  decision: CaseDecision,
  context: {
    disclosedBefore: boolean;
    ticketId: string | null;
    ticketType: EscalationType | null;
    intent: ConversationIntent;
    customerText: string;
  },
): { text: string; citations: Citation[]; uncertainties: string[] } {
  const citations = citationsFor(decision.policyIds);
  const amount = formatInr(record.amountInr);
  const uncertainties: string[] = [];
  const focus = context.intent.issueFocus;
  const tone = context.intent.sentiment;

  if (context.ticketId && context.ticketType && (focus === "ticket_status" || context.intent.wantsTicket || isApprovalLike(context.customerText) || asksNextStepsLocal(context.customerText))) {
    return {
      citations: citationsFor(["ACT-01", "CX-01"]),
      uncertainties,
      text: say(language, {
        en: `${empathy(language, tone)}${ticketLabel(context.ticketType).en} ticket ${context.ticketId} is already open. Our team is on it — you do not need to raise another one. Keep the ticket ID for your records.`,
        hi: `${empathy(language, tone)}${ticketLabel(context.ticketType).hi} टिकट ${context.ticketId} पहले से खुला है। टीम इस पर काम कर रही है — नया टिकट बनाने की जरूरत नहीं। टिकट आईडी संभाल कर रखें।`,
        hinglish: `${empathy(language, tone)}${ticketLabel(context.ticketType).hinglish} ticket ${context.ticketId} pehle se open hai. Team is par kaam kar rahi hai — naya ticket ki zarurat nahi. Ticket ID save rakhijiye.`,
      }),
    };
  }

  if (decision.kind === "unknown") {
    uncertainties.push(decision.reason);
    return {
      citations,
      uncertainties,
      text: say(language, {
        en: `${empathy(language, tone)}For order ${record.orderId}, the return and refund status is not available right now. I will not guess a date or refund number. I can create a human status-check request after you approve.`,
        hi: `${empathy(language, tone)}ऑर्डर ${record.orderId} की रिटर्न और रिफंड स्थिति अभी उपलब्ध नहीं है। मैं कोई तारीख या रिफंड नंबर अनुमान से नहीं बताऊँगी। आपके हाँ कहने पर मैं मानव जाँच का अनुरोध बना सकती हूँ।`,
        hinglish: `${empathy(language, tone)}Order ${record.orderId} ka return aur refund status abhi available nahi hai. Main guess nahi karungi. Aap haan karein to main human status-check request bana sakti hoon.`,
      }),
    };
  }

  if (decision.kind === "final_sale") {
    return {
      citations,
      uncertainties,
      text: say(language, {
        en: `${empathy(language, tone)}Your ${record.product.toLowerCase()} on order ${record.orderId} (${amount}) is marked final sale, so it is normally not returnable. Because you reported a wrong item, I can open a human review after you approve.`,
        hi: `${empathy(language, tone)}ऑर्डर ${record.orderId} का ${record.product} (${amount}) फाइनल सेल है, इसलिए आमतौर पर वापस नहीं होता। आपने गलत आइटम बताया है, इसलिए आपके हाँ कहने पर मैं मानव जाँच खोल सकती हूँ।`,
        hinglish: `${empathy(language, tone)}Order ${record.orderId} ka ${record.product} (${amount}) final sale hai. Wrong item ki wajah se aap haan karein to main human review khol sakti hoon.`,
      }),
    };
  }

  if (decision.kind === "qc") {
    const reason = record.returnRequest.inspectionReason ?? "a quality issue";
    return {
      citations,
      uncertainties,
      text: say(language, {
        en: `${empathy(language, tone)}Your ${record.product.toLowerCase()} return for ${record.orderId} was picked up, but quality check failed because of ${reason}. The refund has not started. I can open a human review after you approve.`,
        hi: `${empathy(language, tone)}ऑर्डर ${record.orderId} की ${record.product} वापसी पिक हो चुकी है, लेकिन क्वालिटी चेक ${reason} की वजह से फेल हुआ। रिफंड शुरू नहीं हुआ। आपके हाँ कहने पर मैं मानव जाँच खोल सकती हूँ।`,
        hinglish: `${empathy(language, tone)}Order ${record.orderId} ki return pick ho chuki hai, lekin QC ${reason} ki wajah se fail hua. Refund start nahi hua. Aap haan karein to human review khol sakti hoon.`,
      }),
    };
  }

  if (decision.kind === "pickup") {
    const days = record.returnRequest.pickupWorkingDaysElapsed ?? 0;
    const exact = decision.boundary === "exact";
    if (context.disclosedBefore && !context.intent.asksRepeatFacts) {
      return {
        citations,
        uncertainties,
        text: followUpPickup(language, tone, days, exact, decision.offer && decision.eligible),
      };
    }
    return {
      citations,
      uncertainties,
      text: exact
        ? say(language, {
            en: `${empathy(language, tone)}Pickup for order ${record.orderId} is still pending after exactly ${days} working days. Quality check and refund have not started. Exactly ${days} working days is not late enough for a pickup support request.`,
            hi: `${empathy(language, tone)}ऑर्डर ${record.orderId} की पिकअप exactly ${days} कामकाजी दिनों से पेंडिंग है। क्वालिटी चेक और रिफंड अभी शुरू नहीं हुए। exactly ${days} दिन अभी सपोर्ट के लिए काफी लेट नहीं हैं।`,
            hinglish: `${empathy(language, tone)}Order ${record.orderId} ka pickup exactly ${days} working days se pending hai. QC aur refund abhi start nahi hue. Exactly ${days} days abhi late nahi hain.`,
          })
        : say(language, {
            en: `${empathy(language, tone)}Your ${record.product.toLowerCase()} return for ${record.orderId} is accepted, but pickup is still pending after ${days} working days. Refund has not started. I can open a pickup support request after you approve.`,
            hi: `${empathy(language, tone)}ऑर्डर ${record.orderId} की ${record.product} वापसी स्वीकार है, लेकिन पिकअप ${days} कामकाजी दिनों से पेंडिंग है। रिफंड शुरू नहीं हुआ। आपके हाँ कहने पर मैं पिकअप सपोर्ट खोल सकती हूँ।`,
            hinglish: `${empathy(language, tone)}Order ${record.orderId} ki return accept hai, lekin pickup ${days} working days se pending hai. Refund start nahi hua. Aap haan karein to pickup support khol sakti hoon.`,
          }),
    };
  }

  const days = record.refund.workingDaysSinceInitiation ?? 0;
  const reference = record.refund.reference ?? "unavailable";
  const prepaid = record.paymentMethod === "prepaid";
  const windowLabel = prepaid ? "5–7" : "7–10";
  const threshold = prepaid ? 7 : 10;
  const contacts =
    record.priorContacts > 0
      ? say(language, {
          en: ` I can also see ${record.priorContacts} earlier contacts about this.`,
          hi: ` इस बारे में ${record.priorContacts} पुराने संपर्क भी दिख रहे हैं।`,
          hinglish: ` Is baare mein ${record.priorContacts} pehle contacts bhi dikh rahe hain.`,
        })
      : "";

  if (context.disclosedBefore && !context.intent.asksRepeatFacts) {
    return {
      citations,
      uncertainties,
      text: followUpRefund(language, {
        tone,
        focus,
        days,
        reference,
        amount,
        prepaid,
        windowLabel,
        threshold,
        eligible: Boolean(decision.eligible && decision.escalationType === "payment_support"),
        offer: decision.offer,
        boundary: decision.boundary === "exact",
        ticketId: context.ticketId,
      }),
    };
  }

  const initiation = say(language, {
    en: " Quality check passed, and the refund was started after that. Pickup date itself is not the refund-start date.",
    hi: " क्वालिटी चेक पास हुआ, और उसके बाद रिफंड शुरू हुआ। पिकअप की तारीख ही रिफंड शुरू होने की तारीख नहीं है।",
    hinglish: " Quality check pass hua, aur uske baad refund start hua. Pickup date hi refund-start date nahi hai.",
  });

  if (decision.boundary === "exact") {
    return {
      citations,
      uncertainties,
      text: say(language, {
        en: `${empathy(language, tone)}Refund ${reference} for your ${prepaid ? "prepaid" : "COD"} ${record.product.toLowerCase()} (${amount}) was started exactly ${days} working days ago and has not reached you yet.${contacts}${initiation} It usually arrives within ${windowLabel} working days. Exactly ${days} working days is not late enough for a payment support request.`,
        hi: `${empathy(language, tone)}आपके ${prepaid ? "प्रीपेड" : "COD"} ${record.product} (${amount}) का रिफंड ${reference} exactly ${days} कामकाजी दिन पहले शुरू हुआ था, और अभी तक नहीं आया।${contacts}${initiation} आमतौर पर ${windowLabel} कामकाजी दिनों में आता है। exactly ${days} दिन अभी सपोर्ट के लिए काफी लेट नहीं हैं।`,
        hinglish: `${empathy(language, tone)}Aapke ${prepaid ? "prepaid" : "COD"} ${record.product} (${amount}) ka refund ${reference} exactly ${days} working days pehle start hua tha, aur abhi nahi aaya.${contacts}${initiation} Usually ${windowLabel} working days mein aata hai. Exactly ${days} days abhi late nahi hain.`,
      }),
    };
  }

  const bank = prepaid
    ? ""
    : say(language, {
        en: " Your bank or wallet choice is already saved, so please do not share full bank details.",
        hi: " आपका बैंक या वॉलेट विकल्प पहले से सेव है, इसलिए पूरा बैंक डिटेल न बताएं।",
        hinglish: " Aapka bank ya wallet choice pehle se saved hai, isliye poori bank details mat bataiye.",
      });

  if (decision.eligible && decision.escalationType === "payment_support") {
    return {
      citations,
      uncertainties,
      text: say(language, {
        en: `${empathy(language, tone)}Refund ${reference} for your ${prepaid ? "prepaid" : "COD"} ${record.product.toLowerCase()} (${amount}) was started ${days} working days ago and has still not reached you.${contacts}${initiation}${bank} ${prepaid ? "Prepaid" : "COD"} refunds usually arrive within ${windowLabel} working days. Because this is more than ${threshold} working days, I can raise a payment support request after you approve.`,
        hi: `${empathy(language, tone)}आपके ${prepaid ? "प्रीपेड" : "COD"} ${record.product} (${amount}) का रिफंड ${reference} ${days} कामकाजी दिन पहले शुरू हुआ था, और अभी तक नहीं आया।${contacts}${initiation}${bank} आमतौर पर ${windowLabel} कामकाजी दिनों में आता है। यह ${threshold} दिनों से ज्यादा है, इसलिए आपके हाँ कहने पर मैं पेमेंट सपोर्ट अनुरोध बना सकती हूँ।`,
        hinglish: `${empathy(language, tone)}Aapke ${prepaid ? "prepaid" : "COD"} ${record.product} (${amount}) ka refund ${reference} ${days} working days pehle start hua tha, aur abhi nahi aaya.${contacts}${initiation}${bank} Usually ${windowLabel} working days mein aata hai. Yeh ${threshold} days se zyada hai, isliye aap haan karein to main payment support request bana sakti hoon.`,
      }),
    };
  }

  return {
    citations,
    uncertainties,
    text: say(language, {
      en: `${empathy(language, tone)}Refund ${reference} for your ${prepaid ? "prepaid" : "COD"} ${record.product.toLowerCase()} (${amount}) was started ${days} working days ago and has not reached you yet.${contacts}${initiation}${bank} It usually arrives within ${windowLabel} working days. ${days} working days is still inside that window, so a payment support request is not needed yet.`,
      hi: `${empathy(language, tone)}आपके ${prepaid ? "प्रीपेड" : "COD"} ${record.product} (${amount}) का रिफंड ${reference} ${days} कामकाजी दिन पहले शुरू हुआ था, और अभी तक नहीं आया।${contacts}${initiation}${bank} आमतौर पर ${windowLabel} कामकाजी दिनों में आता है। ${days} दिन अभी उसी समय के अंदर हैं, इसलिए अभी पेमेंट सपोर्ट की जरूरत नहीं है।`,
      hinglish: `${empathy(language, tone)}Aapke ${prepaid ? "prepaid" : "COD"} ${record.product} (${amount}) ka refund ${reference} ${days} working days pehle start hua tha, aur abhi nahi aaya.${contacts}${initiation}${bank} Usually ${windowLabel} working days mein aata hai. ${days} days abhi usi window ke andar hain, isliye abhi payment support ki zarurat nahi hai.`,
    }),
  };
}

function followUpRefund(
  language: ReplyLanguage,
  input: {
    tone: LiveSentiment;
    focus: IssueFocus;
    days: number;
    reference: string;
    amount: string;
    prepaid: boolean;
    windowLabel: string;
    threshold: number;
    eligible: boolean;
    offer: boolean;
    boundary: boolean;
    ticketId: string | null;
  },
): string {
  const { tone, focus } = input;
  if (input.ticketId) {
    return say(language, {
      en: `${empathy(language, tone)}Your payment support ticket ${input.ticketId} is already with the team. They are chasing the refund from here.`,
      hi: `${empathy(language, tone)}आपका पेमेंट सपोर्ट टिकट ${input.ticketId} टीम के पास है। वे रिफंड को आगे बढ़ा रहे हैं।`,
      hinglish: `${empathy(language, tone)}Aapka payment support ticket ${input.ticketId} team ke paas hai. Woh refund chase kar rahe hain.`,
    });
  }
  if (focus === "reference") {
    return say(language, {
      en: `${empathy(language, tone)}Your refund reference is ${input.reference}.`,
      hi: `${empathy(language, tone)}आपका रिफंड रेफरेंस ${input.reference} है।`,
      hinglish: `${empathy(language, tone)}Aapka refund reference ${input.reference} hai.`,
    });
  }
  if (focus === "amount") {
    return say(language, {
      en: `${empathy(language, tone)}The refund amount on file is ${input.amount}.`,
      hi: `${empathy(language, tone)}रिकॉर्ड में रिफंड राशि ${input.amount} है।`,
      hinglish: `${empathy(language, tone)}Record mein refund amount ${input.amount} hai.`,
    });
  }
  if (focus === "timeline" || focus === "status" || focus === "refund_delay" || focus === "general") {
    if (input.eligible && input.offer && !input.boundary) {
      return say(language, {
        en: `${empathy(language, tone)}It has been ${input.days} working days, which is past the usual ${input.windowLabel}-day window. I can raise a payment support request now if you approve.`,
        hi: `${empathy(language, tone)}${input.days} कामकाजी दिन हो चुके हैं, जो सामान्य ${input.windowLabel} दिन से ज्यादा है। आपके हाँ कहने पर मैं पेमेंट सपोर्ट अनुरोध बना सकती हूँ।`,
        hinglish: `${empathy(language, tone)}${input.days} working days ho chuke hain, jo usual ${input.windowLabel}-day window se zyada hai. Aap haan karein to main payment support request bana sakti hoon.`,
      });
    }
    return say(language, {
      en: `${empathy(language, tone)}It usually arrives within ${input.windowLabel} working days from when the refund started. You are at ${input.days} working days so far${input.boundary ? ", which is not late enough for a support ticket yet" : ""}.`,
      hi: `${empathy(language, tone)}रिफंड शुरू होने के बाद आमतौर पर ${input.windowLabel} कामकाजी दिनों में आता है। अभी ${input.days} दिन हुए हैं${input.boundary ? ", जो अभी टिकट के लिए काफी लेट नहीं हैं" : ""}।`,
      hinglish: `${empathy(language, tone)}Refund start ke baad usually ${input.windowLabel} working days mein aata hai. Abhi ${input.days} days hue hain${input.boundary ? ", jo abhi ticket ke liye late nahi hain" : ""}.`,
    });
  }
  if (focus === "human" || input.eligible) {
    return say(language, {
      en: `${empathy(language, tone)}I hear you. Because this is past the usual window, I can raise payment support after you approve.`,
      hi: `${empathy(language, tone)}मैं समझती हूँ। सामान्य समय से ज्यादा हो चुका है, इसलिए आपके हाँ कहने पर मैं पेमेंट सपोर्ट बना सकती हूँ।`,
      hinglish: `${empathy(language, tone)}Main sun rahi hoon. Window se zyada ho chuka hai, isliye aap haan karein to payment support bana sakti hoon.`,
    });
  }
  return say(language, {
    en: `${empathy(language, tone)}I already shared the key details. What would you like me to clarify — the timeline, the reference, or next steps?`,
    hi: `${empathy(language, tone)}मैं मुख्य डिटेल बता चुकी हूँ। आप क्या क्लियर करना चाहते हैं — समयसीमा, रेफरेंस, या अगला कदम?`,
    hinglish: `${empathy(language, tone)}Main key details bata chuki hoon. Kya clear karna hai — timeline, reference, ya next step?`,
  });
}

function followUpPickup(language: ReplyLanguage, tone: LiveSentiment, days: number, exact: boolean, canOffer: boolean): string {
  if (exact) {
    return say(language, {
      en: `${empathy(language, tone)}Pickup is still pending at exactly ${days} working days, so a support request is not due yet.`,
      hi: `${empathy(language, tone)}पिकअप exactly ${days} कामकाजी दिनों से पेंडिंग है, इसलिए अभी सपोर्ट अनुरोध देय नहीं है।`,
      hinglish: `${empathy(language, tone)}Pickup exactly ${days} working days se pending hai, isliye abhi support due nahi hai.`,
    });
  }
  if (canOffer) {
    return say(language, {
      en: `${empathy(language, tone)}Pickup is still pending after ${days} working days. I can raise pickup support if you approve.`,
      hi: `${empathy(language, tone)}पिकअप ${days} कामकाजी दिनों से पेंडिंग है। आपके हाँ कहने पर मैं पिकअप सपोर्ट बना सकती हूँ।`,
      hinglish: `${empathy(language, tone)}Pickup ${days} working days se pending hai. Aap haan karein to pickup support bana sakti hoon.`,
    });
  }
  return say(language, {
    en: `${empathy(language, tone)}Pickup is still pending. Refund cannot start until pickup and quality check are done.`,
    hi: `${empathy(language, tone)}पिकअप अभी पेंडिंग है। पिकअप और क्वालिटी चेक के बाद ही रिफंड शुरू हो सकता है।`,
    hinglish: `${empathy(language, tone)}Pickup abhi pending hai. Pickup aur QC ke baad hi refund start ho sakta hai.`,
  });
}

function empathy(language: ReplyLanguage, sentiment: LiveSentiment): string {
  if (sentiment === "calm") return "";
  if (sentiment === "concerned") {
    return say(language, {
      en: "I understand this is worrying. ",
      hi: "मैं समझती हूँ, यह चिंता की बात है। ",
      hinglish: "Main samajhti hoon, yeh worrying hai. ",
    });
  }
  if (sentiment === "frustrated") {
    return say(language, {
      en: "I know this has been frustrating. ",
      hi: "मैं समझती हूँ, यह परेशान करने वाला है। ",
      hinglish: "Main samajhti hoon, yeh frustrating hai. ",
    });
  }
  if (sentiment === "aggressive" || sentiment === "escalating") {
    return say(language, {
      en: "I understand how upsetting this follow-up has been. ",
      hi: "मैं समझती हूँ, यह फॉलोअप कितना परेशान करने वाला है। ",
      hinglish: "Main samajhti hoon, yeh follow-up kitna upsetting hai. ",
    });
  }
  return "";
}

function isApprovalLike(text: string): boolean {
  return /^(yes|yeah|yep|ok|okay|sure|haan|ha|हाँ|हां)([,.!]|\s|$)/i.test(text.trim());
}

function asksNextStepsLocal(text: string): boolean {
  return /\b(next steps?|what (do|should) i (have to |need to )?do|what happens next|what now)\b/i.test(text);
}

function ambiguousLine(language: ReplyLanguage): string {
  return say(language, {
    en: "Please say that number digit by digit. I will use the verified record, not a spoken estimate.",
    hi: "कृपया वह नंबर अंकों में बताइए। मैं बोले गए अनुमान से नहीं, दर्ज रिकॉर्ड से बताऊँगी।",
    hinglish: "Please woh number digits mein bataiye. Main spoken estimate se nahi, verified record se bataungi.",
  });
}

function simplePolicy(quote: string): string {
  return quote.replace(/\s+/g, " ").trim();
}

function say(language: ReplyLanguage, lines: Record<ReplyLanguage, string>): string {
  return lines[language];
}

function cap(value: string): string {
  return value ? value[0].toUpperCase() + value.slice(1) : value;
}

export function makeCustomerFriendly(text: string): string {
  const tickets = [...text.matchAll(/\b(?:DEMO|CARE|MOCK)-TICKET-[A-Z0-9-]+\b/gi)].map((match) => match[0]);
  let working = text;
  tickets.forEach((ticket, index) => {
    working = working.replace(ticket, `__TICKET_${index}__`);
  });
  working = working
    .replace(/\(\s*(?:RET|PAY|SEC|ACT|CX)-\d{2}\s*,\s*vela-returns-v1\s*\)/gi, "")
    .replace(/\b(?:RET|PAY|SEC|ACT|CX)-\d{2}\s*\(\s*vela-returns-v1\s*\)/gi, "")
    .replace(/\b(?:RET|PAY|SEC|ACT|CX)-\d{2}\b/gi, "")
    .replace(/\bvela-returns-v1\b/gi, "")
    .replace(/\bwas initiated\b/gi, "was started")
    .replace(/\binitiated\b/gi, "started")
    .replace(/\binitiate\b/gi, "start")
    .replace(/\brefund initiation\b/gi, "refund start")
    .replace(/\bfrom initiation\b/gi, "from the day it was started")
    .replace(/\bpayment-support escalation\b/gi, "payment support request")
    .replace(/\bpayment escalation\b/gi, "payment support request")
    .replace(/\blogistics escalation\b/gi, "pickup support request")
    .replace(/\bmock escalation\b/gi, "support ticket")
    .replace(/\bdemo (support )?ticket\b/gi, "support ticket")
    .replace(/\bdemo request\b/gi, "support request")
    .replace(/\bdemo PIN\b/gi, "order PIN")
    .replace(/\bdemo\b/gi, "")
    .replace(/\bmock\b/gi, "")
    .replace(/\belapsed working days\b/gi, "number of working days")
    .replace(/\bis not received yet\b/gi, "has not reached you yet")
    .replace(/\bis still not received\b/gi, "has still not reached you")
    .replace(/\bis not received\b/gi, "has not reached you")
    .replace(/\bis not beyond this threshold\b/gi, "is not late enough for a support request")
    .replace(/\bnot beyond this threshold\b/gi, "not late enough for a support request")
    .replace(/\bis not due\b/gi, "is not needed yet")
    .replace(/\s+([,.!?।])/g, "$1")
    .replace(/\(\s*\)/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  tickets.forEach((ticket, index) => {
    working = working.replace(`__TICKET_${index}__`, ticket);
  });
  return working;
}

/** Keep critical meaning if the model shortens a reply too much. */
export function phrasingPreservesIntent(approved: string, phrased: string): boolean {
  const needPin = /\bPIN\b|पिन/i.test(approved);
  if (needPin && !/\bPIN\b|पिन/i.test(phrased)) return false;
  const needApprove = /after you approve|Shall I|क्या बनाऊँ|haan karein|approve/i.test(approved);
  if (needApprove && !/approve|Shall I|क्या बनाऊँ|haan|yes/i.test(phrased)) return false;
  if (phrased.trim().length < Math.min(40, Math.floor(approved.trim().length * 0.35))) return false;
  return true;
}
