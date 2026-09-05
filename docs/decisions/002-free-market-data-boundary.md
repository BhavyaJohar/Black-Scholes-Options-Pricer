# ADR 002: Use Market Data for the research feed

## Status

Accepted. Supersedes ADR 001.

## Context

Massive's options snapshot is not available on the configured account. The application needs an accessible research feed for stock quotes, split-adjusted history, and near-the-money option-chain snapshots without weakening the existing server-side trust boundary.

Market Data offers a Free Forever plan with 100 daily credits, 24-hour-delayed stocks and options, and one year of history. Its option-chain endpoint returns quote, liquidity, IV, and Greek columns. AAPL endpoints are available as a tokenless demo; other symbols require a free account token.

## Decision

`MarketDataRestClient` owns authentication, URL construction, timeout/retry policy, credit metadata, and runtime response validation. Provider columnar responses are mapped into the application's row-oriented domain contracts before reaching routes or UI.

Option-chain requests are restricted to one expiration, one side, and the 40 strikes nearest the money. This bounds latency and makes a typical request compatible with the 100-credit daily free tier. Responses are cached at the HTTP boundary for 15 minutes with stale reuse for one hour.

## Consequences

- The research workflow is usable without a paid market-data entitlement.
- Data on the Free Forever plan is at least 24 hours delayed and must never be presented as executable market state.
- A full chain is intentionally unavailable through this UI; expanding the strike window consumes more credits.
- Rate-limit headers and quote timestamps are retained so the UI can disclose freshness and remaining capacity.
- Model IV remains independently recomputed from quote midpoints rather than treating provider analytics as ground truth.

## Alternatives considered

- **Cboe delayed quote pages:** rejected because Cboe explicitly prohibits automated extraction from the delayed quote table.
- **Tradier sandbox:** provides 15-minute-delayed options, but requires a brokerage account and does not include sandbox Greeks.
- **Unofficial Yahoo Finance endpoints:** rejected as an undocumented production dependency with no stability or support contract.
