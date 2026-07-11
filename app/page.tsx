import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { FluxMobileApp } from "./components/FluxMobileApp";

export default async function Home() {
  const user = await getCurrentUser();
  if (user) return <FluxMobileApp initialTab="home" />;
  return <LandingPage />;
}

const FEATURES: { id: string; title: string; body: string }[] = [
  { id: "secure", title: "Secure", body: "Advanced security and account protection" },
  { id: "fast", title: "Fast", body: "High-performance trading experience" },
  { id: "support", title: "Support", body: "24/7 professional support for you" }
];

function LandingPage() {
  return (
    <main className="landing-page">
      <div className="landing-content">
        <header className="landing-header">
          <img className="landing-logo" src="/brand/kairox-main.png" alt="KAIROX Protocol" />
        </header>

        <section className="landing-hero">
          <h1 className="landing-headline">
            Trade with Confidence.
            <br />
            Built for the Future.
          </h1>
          <p className="landing-sub">
            KAIROX Protocol is a next-generation digital asset trading platform designed for security, performance, and user control.
          </p>
        </section>

        <section className="landing-features">
          {FEATURES.map((f) => (
            <div className="landing-feature" key={f.id}>
              <img src={`/landing/icon-${f.id}.png`} alt="" aria-hidden="true" />
              <b>{f.title}</b>
              <em>{f.body}</em>
            </div>
          ))}
        </section>

        <section className="landing-actions">
          <Link href="/register" className="landing-cta landing-cta-primary">
            <span>Create Account</span>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12h14M13 5l7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </Link>
          <Link href="/login" className="landing-cta landing-cta-secondary">
            <span>Log In</span>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12h14M13 5l7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </Link>
        </section>

        <div className="landing-trust">
          <span className="landing-trust-line" aria-hidden="true" />
          <small>Trusted by traders worldwide</small>
          <span className="landing-trust-line" aria-hidden="true" />
        </div>

        <footer className="landing-legal">
          <Link href="/terms">Terms of Service</Link>
          <span aria-hidden="true">·</span>
          <Link href="/privacy">Privacy Policy</Link>
          <span aria-hidden="true">·</span>
          <Link href="/about">About Us</Link>
        </footer>
      </div>
    </main>
  );
}
