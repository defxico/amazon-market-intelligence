import Link from 'next/link';

const endpoints = [
  { method: 'POST', path: '/api/research', description: 'Queue a bounded keyword observation.' },
  { method: 'GET', path: '/api/research/{jobId}', description: 'Read job status and normalized results.' },
  { method: 'GET', path: '/api/trends?keyword=…', description: 'Compare compatible saved snapshots.' },
  { method: 'GET', path: '/api/manufacturers?asin=…', description: 'Read latest screened leads, diagnostics, and earlier results without another provider call.' },
  { method: 'POST', path: '/api/manufacturers/search', description: 'Run one bounded Firecrawl search for a saved non-synthetic product and explicit product brief; returns up to five screened leads with evidence status.' },
  { method: 'POST', path: '/api/enrich', description: 'Save an excerpt from a public HTTPS URL or selected candidate.' },
];

export default function Home() {
  return (
    <main className="shell">
      <header className="topbar">
        <Link className="brand" href="/" aria-label="Amazon Market Intelligence home">
          <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>
          <span>AMI<span className="brand-dot">.</span></span>
        </Link>
        <div className="topbar-right">
          <span className="private-pill"><span className="status-dot" /> Private API</span>
          <a className="docs-link" href="https://ami-live-research-demo.gipyware-0848.chatgpt.site/" target="_blank" rel="noreferrer">Open demo <span aria-hidden="true">↗</span></a>
          <a className="docs-link" href="#api">API reference <span aria-hidden="true">↗</span></a>
        </div>
      </header>

      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-copy">
          <div className="eyebrow"><span className="eyebrow-rule" /> MARKET SIGNALS, WITH PROVENANCE</div>
          <h1 id="hero-title">See the shelf.<br /><em>Understand the shift.</em></h1>
          <p className="hero-description">
            Amazon search observations with clear sources, durable history, and a methodology you can inspect.
            Built for analysts, products, and the agents that help them work.
          </p>
          <div className="hero-actions">
            <a className="button button-primary" href="/api/health">Check service health <span aria-hidden="true">↗</span></a>
            <a className="button button-secondary" href="#api">Explore the API <span aria-hidden="true">↓</span></a>
          </div>
          <div className="hero-footnote"><span className="footnote-mark">i</span> Search position and reviews are directional signals, not verified sales.</div>
        </div>

        <div className="signal-card" aria-label="Example of the kind of signal this service records">
          <div className="signal-card-top">
            <div>
              <span className="card-overline">OBSERVATION MODEL</span>
              <h2>Every signal has a source.</h2>
            </div>
            <span className="signal-icon" aria-hidden="true">⌁</span>
          </div>
          <div className="signal-chart" aria-hidden="true">
            <div className="chart-y-axis"><span>Top</span><span>Mid</span><span>Sample</span></div>
            <div className="chart-area">
              <div className="chart-grid"><span /><span /><span /></div>
              <svg viewBox="0 0 440 156" role="presentation" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="lineFill" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="#9be0ad" stopOpacity=".22" />
                    <stop offset="100%" stopColor="#9be0ad" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path d="M0,125 C28,119 37,94 66,101 S105,122 134,88 S169,65 196,79 S235,99 263,54 S305,72 330,48 S371,31 396,45 S423,19 440,14 L440,156 L0,156Z" fill="url(#lineFill)" />
                <path d="M0,125 C28,119 37,94 66,101 S105,122 134,88 S169,65 196,79 S235,99 263,54 S305,72 330,48 S371,31 396,45 S423,19 440,14" fill="none" stroke="#a5e4b4" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
                <circle cx="330" cy="48" r="4" fill="#d3f2dc" stroke="#254332" strokeWidth="3" vectorEffect="non-scaling-stroke" />
                <circle cx="440" cy="14" r="4" fill="#d3f2dc" stroke="#254332" strokeWidth="3" vectorEffect="non-scaling-stroke" />
              </svg>
              <div className="chart-x-axis"><span>Snapshot 01</span><span>Snapshot 02</span><span>Snapshot 03</span></div>
            </div>
          </div>
          <div className="signal-legend">
            <span><i className="legend-line" /> Observed search rank</span>
            <span className="legend-note">Illustrative · not live data</span>
          </div>
          <div className="provenance-row">
            <div className="source-symbol">S</div>
            <div className="source-copy"><strong>Source recorded</strong><span>Provider · time · evidence URL</span></div>
            <span className="source-check" aria-label="Included">✓</span>
          </div>
        </div>
      </section>

      <section className="principles" aria-label="Service principles">
        <article className="principle"><span className="principle-number">01</span><div><h2>Observed, not guessed</h2><p>Only returned listing fields are saved. Missing values stay missing.</p></div></article>
        <article className="principle"><span className="principle-number">02</span><div><h2>Designed for replay</h2><p>Durable jobs and idempotent writes handle asynchronous delivery.</p></div></article>
        <article className="principle"><span className="principle-number">03</span><div><h2>One shared service</h2><p>REST and MCP use the same validation, budgets, and research logic.</p></div></article>
      </section>

      <section className="api-section" id="api" aria-labelledby="api-title">
        <div className="section-heading">
          <div><div className="eyebrow"><span className="eyebrow-rule" /> PRIVATE BY DEFAULT</div><h2 id="api-title">A small surface.<br /><em>Useful signals.</em></h2></div>
          <p>All research operations require a bearer token. The health endpoint is intentionally anonymous and reveals no configuration.</p>
        </div>
        <div className="api-grid">
          <div className="endpoint-list">
            {endpoints.map((endpoint) => (
              <div className="endpoint" key={endpoint.path}>
                <span className={`method method-${endpoint.method.toLowerCase()}`}>{endpoint.method}</span>
                <div className="endpoint-details"><code>{endpoint.path}</code><p>{endpoint.description}</p></div>
                <span className="endpoint-arrow" aria-hidden="true">↗</span>
              </div>
            ))}
          </div>
          <aside className="mcp-card">
            <div className="mcp-mark" aria-hidden="true"><span /><span /><span /><span /></div>
            <span className="card-overline">FOR AI CLIENTS</span>
            <h3>Same research.<br />A tool call away.</h3>
            <p>Connect an MCP host to the same authenticated operations over Streamable HTTP.</p>
            <div className="mcp-path"><span>ENDPOINT</span><code>/api/mcp</code></div>
            <div className="mcp-tools"><span>5 tools</span><span>Bearer auth</span><span>Stateless</span></div>
          </aside>
        </div>
      </section>

      <footer className="footer">
        <Link className="brand footer-brand" href="/">
          <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span><span>AMI<span className="brand-dot">.</span></span>
        </Link>
        <p>Amazon search observations, with their limits made clear.</p>
        <a href="/api/health">Service health <span aria-hidden="true">↗</span></a>
      </footer>
    </main>
  );
}
