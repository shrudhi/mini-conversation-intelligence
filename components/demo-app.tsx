"use client";

import { useEffect, useState } from "react";
import { LandingPage, type LandingCard } from "@/components/landing-page";
import { PmDashboard } from "@/components/pm-dashboard";
import { PmSettings } from "@/components/pm-settings";
import { VoiceAgent } from "@/components/voice-agent";

type View = "landing" | "support" | "pm" | "settings";

export function DemoApp() {
  const [view, setView] = useState<View>("landing");
  const [focusSession, setFocusSession] = useState<string | null>(null);
  const [cards, setCards] = useState<LandingCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [bootstrap, setBootstrap] = useState<{ customerId: string; orderId: string } | null>(null);

  useEffect(() => {
    void fetch("/api/status")
      .then((response) => response.json())
      .then((payload: { cards?: LandingCard[] }) => {
        setCards(payload.cards ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  function openSupport() {
    if (view === "landing") {
      document.getElementById("demo-access")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    setView("support");
    if (!bootstrap && cards[0]) {
      setBootstrap({ customerId: cards[0].customerId, orderId: cards[0].orderId });
      setSelectedKey(`${cards[0].customerId}:${cards[0].orderId}`);
    }
  }

  function selectCustomer(customerId: string, orderId: string) {
    setSelectedKey(`${customerId}:${orderId}`);
    setBootstrap({ customerId, orderId });
    setView("support");
  }

  function Nav({ active }: { active: View }) {
    return (
      <nav className="landing-links dark" aria-label="Primary">
        <button type="button" className={active === "support" ? "landing-link active" : "landing-link"} onClick={openSupport}>
          Customer support
        </button>
        <button
          type="button"
          className={active === "pm" ? "landing-link active" : "landing-link"}
          onClick={() => setView("pm")}
        >
          Performance dashboard
        </button>
        <button
          type="button"
          className={active === "settings" ? "landing-link active" : "landing-link"}
          onClick={() => setView("settings")}
        >
          Agent settings
        </button>
      </nav>
    );
  }

  return (
    <>
      {view === "landing" ? (
        <LandingPage
          cards={cards}
          selectedKey={selectedKey}
          loading={loading}
          onSelectCustomer={selectCustomer}
          onOpenSupport={openSupport}
          onOpenDashboard={() => setView("pm")}
          onOpenSettings={() => setView("settings")}
        />
      ) : null}

      {view === "support" ? (
        <div className="app-shell">
          <header className="app-nav">
            <div className="wrap app-nav-inner">
              <button type="button" className="landing-brand dark" onClick={() => setView("landing")}>
                VELAWEAR
              </button>
              <Nav active="support" />
            </div>
          </header>
          <main className="page wrap">
            <VoiceAgent
              bootstrap={bootstrap}
              onSignOut={() => {
                setBootstrap(null);
                setView("landing");
              }}
              onOpenDashboard={(sessionId) => {
                setFocusSession(sessionId);
                setView("pm");
              }}
            />
          </main>
        </div>
      ) : null}

      {view === "pm" ? (
        <div className="app-shell">
          <header className="app-nav">
            <div className="wrap app-nav-inner">
              <button type="button" className="landing-brand dark" onClick={() => setView("landing")}>
                VELAWEAR
              </button>
              <Nav active="pm" />
            </div>
          </header>
          <main className="page wrap">
            <PmDashboard focusSession={focusSession} />
          </main>
        </div>
      ) : null}

      {view === "settings" ? (
        <div className="app-shell">
          <header className="app-nav">
            <div className="wrap app-nav-inner">
              <button type="button" className="landing-brand dark" onClick={() => setView("landing")}>
                VELAWEAR
              </button>
              <Nav active="settings" />
            </div>
          </header>
          <main className="page wrap">
            <PmSettings />
          </main>
        </div>
      ) : null}
    </>
  );
}
