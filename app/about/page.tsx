import Link from "next/link";

export default function AboutRoutePage() {
  return (
    <main className="legal-route">
      <header className="legal-route-header">
        <Link href="/" className="legal-route-back" aria-label="Back">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M15 19l-7-7 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </Link>
        <h2>About</h2>
        <span aria-hidden="true" />
      </header>
      <div className="stack-page legal-page about-route-page">
        <img className="about-logo" src="/brand/kairox-symbol.png" alt="KAIROX" />
        <h1 className="about-title">KAIROX Protocol</h1>
        <p className="about-tagline">Liquidity in motion.</p>
        <p className="about-body">
          KAIROX Protocol is a digital asset trading platform designed for secure account management,
          efficient trading workflows, funding records, identity verification, and responsive support.
        </p>
        <div className="about-stats">
          <div className="about-stat"><b>24/7</b><em>Trading</em></div>
          <div className="about-stat"><b>Secure</b><em>Custody</em></div>
          <div className="about-stat"><b>Global</b><em>Liquidity</em></div>
        </div>
        <div className="legal-disclaimer about-disclaimer">
          <span>For support or questions, please contact us through the in-app Support center.</span>
        </div>
      </div>
    </main>
  );
}
