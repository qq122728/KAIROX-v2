import Link from "next/link";

const TERMS_SECTIONS = [
  { title: "Use of Platform", body: "By accessing or using this platform, you agree to follow these Terms, our platform rules, and all applicable laws and regulations. You are responsible for all activities conducted through your account." },
  { title: "Eligibility", body: "You must be at least 18 years old or the legal age of majority in your jurisdiction to use this platform. By using our services, you confirm that you meet these requirements." },
  { title: "Trading Risk", body: "Digital asset trading involves risk. Prices may fluctuate significantly, and you are solely responsible for your trading decisions, orders, positions, gains, and losses." },
  { title: "Account Security", body: "You are responsible for keeping your account, password, and authentication credentials secure. Please contact support immediately if you notice any unauthorized activity." },
  { title: "Deposits and Withdrawals", body: "Deposits, withdrawals, and transfers may be subject to verification, network conditions, risk checks, and platform processing rules." },
  { title: "Prohibited Activities", body: "You agree not to misuse the platform, attempt unauthorized access, engage in fraud, market manipulation, money laundering, or any illegal or harmful activity." },
  { title: "KYC and Compliance", body: "We may require identity verification or additional information to comply with regulatory, security, and risk-control requirements." },
  { title: "Service Changes", body: "We may update, suspend, or modify certain services, features, fees, or rules when necessary for security, compliance, maintenance, or product improvement." }
];

export default function TermsRoutePage() {
  return (
    <main className="legal-route">
      <header className="legal-route-header">
        <Link href="/" className="legal-route-back" aria-label="Back">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M15 19l-7-7 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </Link>
        <h2>Terms of Service</h2>
        <span aria-hidden="true" />
      </header>
      <div className="stack-page legal-page">
        <h1 className="legal-title">Terms of Service</h1>
        <p className="legal-updated">Last updated: May 20, 2024</p>
        <ol className="legal-list">
          {TERMS_SECTIONS.map((section, idx) => (
            <li key={section.title} className="legal-item">
              <span className="legal-num">{idx + 1}</span>
              <div className="legal-item-body">
                <b>{section.title}</b>
                <em>{section.body}</em>
              </div>
            </li>
          ))}
        </ol>
        <div className="legal-disclaimer">
          <span>By continuing, you agree to our Terms of Service.</span>
        </div>
      </div>
    </main>
  );
}
