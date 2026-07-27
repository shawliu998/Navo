export default function AccountDetailLoading() {
  return (
    <div className="page page-wide account-workspace" aria-busy="true" aria-label="Loading account intelligence">
      <div className="account-back-row">
        <span className="account-skeleton account-skeleton-line account-skeleton-line-short" style={{ width: 96 }} />
      </div>
      <div className="account-loading-header" />
      <div className="account-loading-grid">
        <div className="account-loading-main">
          <div className="account-skeleton account-skeleton-title" />
          <div className="account-skeleton account-skeleton-line" />
          <div className="account-skeleton account-skeleton-line" />
          <div className="account-skeleton account-skeleton-line account-skeleton-line-medium" />
          <div style={{ height: 44 }} />
          <div className="account-skeleton account-skeleton-title" />
          <div className="account-skeleton account-skeleton-line" />
          <div className="account-skeleton account-skeleton-line account-skeleton-line-medium" />
        </div>
        <aside className="account-loading-rail">
          <div className="account-skeleton account-skeleton-title" />
          <div className="account-skeleton account-skeleton-line" />
          <div className="account-skeleton account-skeleton-line account-skeleton-line-medium" />
        </aside>
      </div>
    </div>
  );
}
