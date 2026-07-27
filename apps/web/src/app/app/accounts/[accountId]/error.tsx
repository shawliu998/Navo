"use client";

import Link from "next/link";
import { AlertTriangle, ArrowLeft, RefreshCw } from "lucide-react";

export default function AccountDetailError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="page page-wide account-error-state" role="alert">
      <section className="account-error-panel">
        <span><AlertTriangle size={18} /></span>
        <h1>Account intelligence could not be loaded</h1>
        <p>The account remains unchanged. Retry the request, or return to Accounts and open it again.</p>
        <div className="account-error-actions">
          <Link href="/app/accounts" className="button button-secondary"><ArrowLeft size={13} />Accounts</Link>
          <button type="button" className="button button-primary" onClick={reset}><RefreshCw size={13} />Try again</button>
        </div>
      </section>
    </div>
  );
}
