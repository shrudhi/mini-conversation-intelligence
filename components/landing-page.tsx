"use client";

import { customerAvatarSrc } from "@/lib/avatars";

export type LandingCard = {
  customerId: string;
  customerName: string;
  avatarUrl?: string;
  city: string;
  segment: string;
  orderId: string;
  product: string;
  title: string;
  customerProblem: string;
  amountLabel: string;
  priority: { level: string; label: string };
  preferredLanguage: string;
};

type LandingPageProps = {
  cards: LandingCard[];
  selectedKey: string | null;
  onSelectCustomer: (customerId: string, orderId: string) => void;
  onOpenSupport: () => void;
  onOpenDashboard: () => void;
  onOpenSettings: () => void;
  loading?: boolean;
};

export function LandingPage({
  cards,
  selectedKey,
  onSelectCustomer,
  onOpenSupport,
  onOpenDashboard,
  onOpenSettings,
  loading,
}: LandingPageProps) {
  const featured = cards.slice(0, 3);
  const rest = cards.slice(3);

  return (
    <div className="landing">
      <section className="landing-hero">
        <div className="landing-nav wrap">
          <a className="landing-brand" href="#top" onClick={(event) => event.preventDefault()}>
            VELAWEAR
          </a>
          <nav className="landing-links" aria-label="Primary">
            <button type="button" className="landing-link active" onClick={onOpenSupport}>
              Customer support
            </button>
            <button type="button" className="landing-link" onClick={onOpenDashboard}>
              Performance dashboard
            </button>
            <button type="button" className="landing-link" onClick={onOpenSettings}>
              Agent settings
            </button>
          </nav>
        </div>

        <div className="landing-hero-grid wrap">
          <div className="landing-copy">
            <p className="landing-kicker">VelaWear Care</p>
            <h1>Support that listens.</h1>
            <p className="landing-lede">Talk to our voice agent about orders, returns and refunds.</p>
            <div className="landing-cta">
              <button type="button" className="landing-btn primary" onClick={onOpenSupport}>
                Customer support
                <span aria-hidden="true">→</span>
              </button>
              <button type="button" className="landing-btn ghost" onClick={onOpenDashboard}>
                Performance dashboard
                <span aria-hidden="true">→</span>
              </button>
            </div>
          </div>
          <div className="landing-hero-media">
            <img
              src="/velawear-hero.jpg"
              alt="VelaWear customers shopping multi-category fashion in store"
              width={920}
              height={560}
            />
          </div>
        </div>
      </section>

      <section className="landing-access" id="demo-access">
        <div className="wrap">
          <p className="access-kicker">Demo access</p>
          <h2>Choose a demo customer</h2>
          <p className="access-lede">
            Use one of the demo profiles below to experience a real conversation with our voice support agent.
          </p>

          {loading ? <p className="muted">Loading demo profiles…</p> : null}

          <div className="access-grid">
            {featured.map((card, index) => {
              const key = `${card.customerId}:${card.orderId}`;
              const selected = selectedKey === key || (!selectedKey && index === 0);
              return (
                <button
                  key={key}
                  type="button"
                  className={selected ? "access-card selected" : "access-card"}
                  onClick={() => onSelectCustomer(card.customerId, card.orderId)}
                >
                  <div className="access-avatar" aria-hidden="true">
                    <img src={card.avatarUrl || customerAvatarSrc(card.customerId)} alt="" />
                  </div>
                  <div className="access-body">
                    <strong>{card.customerName}</strong>
                    <p className="access-tags">
                      {card.segment} · {card.title}
                    </p>
                    <p className="access-blurb">{card.customerProblem}</p>
                  </div>
                  <span className="access-go" aria-hidden="true">
                    →
                  </span>
                </button>
              );
            })}
          </div>

          {rest.length > 0 ? (
            <div className="access-grid more">
              {rest.map((card) => {
                const key = `${card.customerId}:${card.orderId}`;
                const selected = selectedKey === key;
                return (
                  <button
                    key={key}
                    type="button"
                    className={selected ? "access-card selected" : "access-card"}
                    onClick={() => onSelectCustomer(card.customerId, card.orderId)}
                  >
                    <div className="access-avatar" aria-hidden="true">
                      <img src={card.avatarUrl || customerAvatarSrc(card.customerId)} alt="" />
                    </div>
                    <div className="access-body">
                      <strong>{card.customerName}</strong>
                      <p className="access-tags">
                        {card.segment} · {card.title}
                      </p>
                      <p className="access-blurb">{card.customerProblem}</p>
                    </div>
                    <span className="access-go" aria-hidden="true">
                      →
                    </span>
                  </button>
                );
              })}
            </div>
          ) : null}

          <p className="access-note">
            <span aria-hidden="true">ⓘ</span> Demo profiles for testing. No real customer data is used.
          </p>
        </div>
      </section>
    </div>
  );
}
