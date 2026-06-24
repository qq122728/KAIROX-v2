import Link from "next/link";

const PRIVACY_MODULES = [
  { title: "Information We Collect", body: "We collect account information, identity verification details, transaction records, device data, and usage information." },
  { title: "How We Use Information", body: "We use your data for authentication, KYC verification, funding records, account security, risk control, and customer support." },
  { title: "Data Security", body: "We apply technical and organizational measures to protect your data against unauthorized access and disclosure." },
  { title: "Your Rights", body: "You may request access, correction, or deletion of your personal information where applicable." }
];

export default function PrivacyRoutePage() {
  return (
    <main className="legal-route">
      <header className="legal-route-header">
        <Link href="/" className="legal-route-back" aria-label="Back">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M15 19l-7-7 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </Link>
        <h2>Privacy Policy</h2>
        <span aria-hidden="true" />
      </header>
      <div className="stack-page legal-page">
        <h1 className="legal-title">Privacy Policy</h1>
        <p className="legal-updated">Last updated: May 20, 2024</p>
        <div className="privacy-modules">
          {PRIVACY_MODULES.map((mod) => (
            <div key={mod.title} className="privacy-module">
              <span className="privacy-module-icon" aria-hidden="true">🛡</span>
              <div className="privacy-module-body">
                <b>{mod.title}</b>
                <em>{mod.body}</em>
              </div>
            </div>
          ))}
        </div>
        <div className="legal-disclaimer">
          <span>We are committed to protecting your privacy and handling your data transparently and securely.</span>
        </div>
      </div>
    </main>
  );
}
