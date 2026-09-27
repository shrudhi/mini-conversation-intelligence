"use client";

import { useEffect, useState } from "react";

type Props = {
  open: boolean;
  busy: boolean;
  error: string | null;
  confirmation: string | null;
  onSubmit: (input: { satisfied: "yes" | "no"; resolved: "yes" | "partly" | "no"; comment: string }) => void;
  onSkip: () => void;
  onClose: () => void;
};

export function FeedbackModal({ open, busy, error, confirmation, onSubmit, onSkip, onClose }: Props) {
  const [satisfied, setSatisfied] = useState<"yes" | "no" | null>(null);
  const [resolved, setResolved] = useState<"yes" | "partly" | "no" | null>(null);
  const [comment, setComment] = useState("");

  useEffect(() => {
    if (!open) {
      setSatisfied(null);
      setResolved(null);
      setComment("");
    }
  }, [open]);

  if (!open) return null;

  if (confirmation) {
    return (
      <div className="feedback-overlay" role="dialog" aria-modal="true" aria-labelledby="feedback-title">
        <div className="feedback-modal">
          <div className="feedback-icon" aria-hidden />
          <h2 id="feedback-title">Thank you</h2>
          <p className="muted">{confirmation}</p>
          <button className="feedback-submit" type="button" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="feedback-overlay" role="dialog" aria-modal="true" aria-labelledby="feedback-title">
      <div className="feedback-modal">
        <div className="feedback-icon" aria-hidden />
        <h2 id="feedback-title">How was your support experience?</h2>
        <p className="muted">Your conversation is saved. Feedback is optional.</p>

        <fieldset className="feedback-fieldset">
          <legend>Are you satisfied with this conversation?</legend>
          <div className="feedback-choices two">
            <button
              type="button"
              className={`feedback-choice yes ${satisfied === "yes" ? "selected" : ""}`}
              onClick={() => setSatisfied("yes")}
              disabled={busy}
            >
              <span aria-hidden>👍</span> Yes
            </button>
            <button
              type="button"
              className={`feedback-choice no ${satisfied === "no" ? "selected" : ""}`}
              onClick={() => setSatisfied("no")}
              disabled={busy}
            >
              <span aria-hidden>👎</span> No
            </button>
          </div>
        </fieldset>

        <fieldset className="feedback-fieldset">
          <legend>Was your issue resolved?</legend>
          <div className="feedback-choices three">
            <button
              type="button"
              className={`feedback-choice yes ${resolved === "yes" ? "selected" : ""}`}
              onClick={() => setResolved("yes")}
              disabled={busy}
            >
              <span aria-hidden>✓</span> Yes
            </button>
            <button
              type="button"
              className={`feedback-choice partly ${resolved === "partly" ? "selected" : ""}`}
              onClick={() => setResolved("partly")}
              disabled={busy}
            >
              <span aria-hidden>—</span> Partly
            </button>
            <button
              type="button"
              className={`feedback-choice no ${resolved === "no" ? "selected" : ""}`}
              onClick={() => setResolved("no")}
              disabled={busy}
            >
              <span aria-hidden>×</span> No
            </button>
          </div>
        </fieldset>

        <label className="field">
          Tell us what we could improve (optional)
          <textarea
            value={comment}
            maxLength={300}
            placeholder="Share your feedback..."
            onChange={(event) => setComment(event.target.value)}
            disabled={busy}
          />
          <small className="feedback-counter">{comment.length}/300</small>
        </label>

        {error ? <div className="banner banner-amber">{error}</div> : null}

        <button
          className="feedback-submit"
          type="button"
          disabled={busy || !satisfied || !resolved}
          onClick={() => {
            if (!satisfied || !resolved) return;
            onSubmit({ satisfied, resolved, comment });
          }}
        >
          {busy ? "Saving…" : "Submit feedback"}
        </button>
        <button className="feedback-skip" type="button" disabled={busy} onClick={onSkip}>
          Skip for now
        </button>
      </div>
    </div>
  );
}
