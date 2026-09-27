"use client";

import { useEffect, useRef, useState } from "react";
import {
  defaultAgentSettings,
  type AgentSettingsCapabilities,
  type AgentStyleSettings,
  type AgentTone,
  type EmpathyLevel,
  type ResponseLength,
} from "@/lib/agent-settings";

type SettingsPayload = {
  settings: AgentStyleSettings;
  capabilities: AgentSettingsCapabilities;
  error?: string;
};

export function PmSettings() {
  const [settings, setSettings] = useState<AgentStyleSettings>(defaultAgentSettings());
  const [capabilities, setCapabilities] = useState<AgentSettingsCapabilities | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);

  useEffect(() => {
    void load();
    return () => {
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    };
  }, []);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/settings");
      const payload = (await response.json()) as SettingsPayload;
      if (!response.ok) {
        setError(payload.error || "Settings could not be loaded.");
        return;
      }
      setSettings(payload.settings);
      setCapabilities(payload.capabilities);
    } catch {
      setError("Settings could not be loaded.");
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const payload = (await response.json()) as SettingsPayload;
      if (!response.ok) {
        setError(payload.error || "Settings were not saved.");
        return;
      }
      setSettings(payload.settings);
      setCapabilities(payload.capabilities);
      setMessage("Saved. New conversations will use these settings. Open chats keep their original style.");
    } catch {
      setError("Settings were not saved.");
    } finally {
      setSaving(false);
    }
  }

  async function previewVoice() {
    if (!capabilities?.previewAvailable) {
      setError(capabilities?.previewReason || "Voice preview is unavailable.");
      return;
    }
    setPreviewing(true);
    setError(null);
    try {
      const response = await fetch("/api/settings/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const payload = (await response.json()) as {
        error?: string;
        audioBase64?: string;
        contentType?: string;
      };
      if (!response.ok || !payload.audioBase64) {
        setError(payload.error || "Preview failed.");
        return;
      }
      const bytes = Uint8Array.from(atob(payload.audioBase64), (char) => char.charCodeAt(0));
      const blob = new Blob([bytes], { type: payload.contentType || "audio/mpeg" });
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
      const url = URL.createObjectURL(blob);
      audioUrlRef.current = url;
      if (audioRef.current) {
        audioRef.current.src = url;
        await audioRef.current.play();
      }
    } catch {
      setError("Preview failed.");
    } finally {
      setPreviewing(false);
    }
  }

  function patch<K extends keyof AgentStyleSettings>(key: K, value: AgentStyleSettings[K]) {
    setSettings((current) => ({ ...current, [key]: value }));
    setMessage(null);
  }

  return (
    <div className="dashboard pm-dash pm-settings">
      <div className="pm-head">
        <div>
          <h1 className="pm-title">Agent settings</h1>
          <p className="muted">
            Style and audio for new conversations only. Policy, case facts, and safety rules stay unchanged.
          </p>
        </div>
      </div>

      {loading ? <p className="muted">Loading settings…</p> : null}
      {error ? <div className="banner banner-danger">{error}</div> : null}
      {message ? <div className="banner banner-teal">{message}</div> : null}
      {capabilities ? <p className="muted pm-note">{capabilities.note}</p> : null}

      {!loading ? (
        <div className="pm-settings-grid">
          <section className="panel">
            <div className="panel-head">
              <h2>Response style</h2>
              <p>How the agent sounds when phrasing an already-approved reply.</p>
            </div>
            <fieldset className="settings-fieldset">
              <legend>Tone</legend>
              <div className="settings-options">
                {(
                  [
                    ["warm", "Warm"],
                    ["professional", "Professional"],
                    ["concise", "Concise"],
                  ] as Array<[AgentTone, string]>
                ).map(([value, label]) => (
                  <label key={value} className={settings.tone === value ? "settings-choice active" : "settings-choice"}>
                    <input
                      type="radio"
                      name="tone"
                      checked={settings.tone === value}
                      onChange={() => patch("tone", value)}
                    />
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset className="settings-fieldset">
              <legend>Response length</legend>
              <div className="settings-options">
                {(
                  [
                    ["brief", "Brief"],
                    ["balanced", "Balanced"],
                    ["detailed", "Detailed"],
                  ] as Array<[ResponseLength, string]>
                ).map(([value, label]) => (
                  <label
                    key={value}
                    className={settings.responseLength === value ? "settings-choice active" : "settings-choice"}
                  >
                    <input
                      type="radio"
                      name="responseLength"
                      checked={settings.responseLength === value}
                      onChange={() => patch("responseLength", value)}
                    />
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset className="settings-fieldset">
              <legend>Empathy level</legend>
              <div className="settings-options">
                {(
                  [
                    ["low", "Low"],
                    ["medium", "Medium"],
                    ["high", "High"],
                  ] as Array<[EmpathyLevel, string]>
                ).map(([value, label]) => (
                  <label
                    key={value}
                    className={settings.empathyLevel === value ? "settings-choice active" : "settings-choice"}
                  >
                    <input
                      type="radio"
                      name="empathyLevel"
                      checked={settings.empathyLevel === value}
                      onChange={() => patch("empathyLevel", value)}
                    />
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>

            <label className="field">
              Approved greeting
              <textarea
                value={settings.greeting}
                onChange={(event) => patch("greeting", event.target.value)}
                rows={3}
                maxLength={240}
              />
            </label>
            <label className="field">
              Approved sign-off
              <textarea
                value={settings.signOff}
                onChange={(event) => patch("signOff", event.target.value)}
                rows={2}
                maxLength={160}
              />
            </label>
          </section>

          <section className="panel">
            <div className="panel-head">
              <h2>Language & voice</h2>
              <p>Defaults for new chats. Each conversation stores the settings it started with.</p>
            </div>

            <fieldset className="settings-fieldset">
              <legend>Language</legend>
              <div className="settings-options">
                {(
                  [
                    ["auto", "Auto-detect"],
                    ["en", "English"],
                    ["hi", "Hindi"],
                  ] as const
                ).map(([value, label]) => (
                  <label
                    key={value}
                    className={settings.languageMode === value ? "settings-choice active" : "settings-choice"}
                  >
                    <input
                      type="radio"
                      name="languageMode"
                      checked={settings.languageMode === value}
                      onChange={() => patch("languageMode", value)}
                    />
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset className="settings-fieldset">
              <legend>Speaking voice</legend>
              <div className="settings-voice-grid">
                {(capabilities?.voices ?? []).map((voice) => (
                  <label
                    key={voice.id}
                    className={[
                      "settings-choice",
                      settings.voice === voice.id ? "active" : "",
                      !voice.available ? "unavailable" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    title={voice.reason ?? undefined}
                  >
                    <input
                      type="radio"
                      name="voice"
                      checked={settings.voice === voice.id}
                      disabled={!voice.available}
                      onChange={() => patch("voice", voice.id)}
                    />
                    <span>{voice.label}</span>
                    {!voice.available ? <small>Unavailable</small> : null}
                  </label>
                ))}
              </div>
              {capabilities && !capabilities.liveAudio ? (
                <p className="muted tiny">Speaking voices are unavailable until OPENAI_API_KEY is configured.</p>
              ) : null}
            </fieldset>

            <div className="settings-preview">
              <button
                type="button"
                className="secondary"
                disabled={previewing || !capabilities?.previewAvailable}
                onClick={() => void previewVoice()}
              >
                {previewing ? "Playing preview…" : "Play voice preview"}
              </button>
              {!capabilities?.previewAvailable ? (
                <span className="settings-unavailable">{capabilities?.previewReason || "Preview unavailable"}</span>
              ) : (
                <span className="muted tiny">Uses the current greeting text and speaking voice.</span>
              )}
              <audio ref={audioRef} className="sr-only" controls />
            </div>
          </section>
        </div>
      ) : null}

      <div className="actions pm-settings-actions">
        <button type="button" className="primary" disabled={saving || loading} onClick={() => void save()}>
          {saving ? "Saving…" : "Save settings"}
        </button>
        <button type="button" className="ghost" disabled={loading || saving} onClick={() => void load()}>
          Reset to saved
        </button>
      </div>
    </div>
  );
}
