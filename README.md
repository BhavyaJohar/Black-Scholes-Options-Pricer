# Options & Portfolio Risk Lab

A typed Next.js research terminal for option valuation, delayed volatility-surface diagnostics, and equity-portfolio risk. The project emphasizes transparent numerical methods, explicit assumptions, reproducible simulation, and validated market-data boundaries.

[Live demo](https://bhavyas-options-pricing.vercel.app/) · [Author](https://bhavyarjohar.com)

## What it does

### Option valuation

- Black-Scholes-Merton prices and analytical Delta, Gamma, Theta, Vega, and Rho
- Continuous dividend-yield support
- Cox-Ross-Rubinstein lattice for European and American exercise
- Expiration payoff and break-even visualization
- 11×9 option-price heatmap across spot and volatility shocks
- Manual spot input, so the calculator works with no account or API key
- Stable bisection solver for European-equivalent implied volatility
- Optional delayed stock snapshots through Market Data

### Delayed options surface

- Market Data option-chain snapshots with quotes, vendor IV, Greeks, volume, and open interest
- Independent midpoint-IV inversion and vendor/model IV residuals
- Bid/ask spread diagnostics and nearest-to-money contract ranking
- Volatility-smile visualization and one-click transfer into the pricing model
- Explicit snapshot timestamps and provider credit metadata

### Portfolio risk

- Long/short, gross-capital-weighted daily returns aligned by trading date
- CAPM alpha and beta against SPY
- Annualized Sharpe ratio and volatility
- Maximum drawdown and one-day 95% historical VaR
- Seeded, reproducible Monte Carlo projection over log returns
- Deterministic mean-variance portfolio cloud with an approximate efficient frontier
- Minimum-volatility and maximum-Sharpe portfolios, current exposure, and capital market line
- Local browser persistence; no database is required

## Research workflows

| Route | Workspace | Purpose |
| --- | --- | --- |
| [`/`](quant/src/app/page.tsx) | Option Pricing Workbench | Price a European or American call/put, inspect Greeks and payoff, and stress the price across spot/volatility scenarios. |
| [`/market`](quant/src/app/market/page.tsx) | Options Surface Monitor | Inspect delayed option-chain snapshots, quote quality, IV residuals, and the smile before transferring a contract into the pricer. |
| [`/portfolio`](quant/src/app/portfolio/page.tsx) | Portfolio Risk Monitor | Construct a signed equity portfolio, estimate historical risk, simulate terminal returns, and compare it with the mean-variance opportunity set. |

The workspaces are deliberately connected: a surfaced option contract can seed the pricer, while the portfolio monitor preserves positions and recent analysis locally for iterative research.

## Data and persistence

- **Manual-first:** pricing works with a manually entered spot and no third-party account. If a quote request fails, the model remains usable with the last manual inputs.
- **Delayed market data:** optional quote, candle, and option-chain requests use Market Data on the server. The UI exposes snapshot time and provider credit metadata rather than presenting delayed data as live.
- **No cloud portfolio database:** positions, calculator inputs, and recent portfolio results are stored in the browser's local storage. AWS/database credentials are not required.
- **No execution path:** this is a research terminal. It does not place orders, hold brokerage credentials, or provide investment advice.

## Engineering highlights

- Strict TypeScript and runtime validation at HTTP boundaries
- Server-only Bearer authentication; keys never appear in browser code or request URLs
- Typed Market Data REST adapter with response validation, request timeouts, bounded exponential retries, and credit-budget metadata
- Numerical domain checks that fail explicitly instead of emitting `NaN`
- Unit and contract tests for authentication, retries, credit metadata, response normalization, put-call parity, CRR convergence, IV recovery, position direction, drawdown, VaR, and deterministic simulation
- CI gates for lint, typecheck, tests, and production build

## Architecture

```text
quant/src/
├── app/
│   ├── api/
│   │   ├── options/route.ts     # normalized option chain + local IV diagnostics
│   │   ├── portfolio/route.ts   # validates positions, fetches aligned histories
│   │   ├── price/route.ts       # validates and prices option requests
│   │   └── stocks/route.ts      # delayed single-ticker snapshot adapter
│   ├── market/page.tsx          # delayed volatility-surface monitor
│   ├── portfolio/page.tsx       # portfolio construction and risk dashboard
│   └── page.tsx                 # option-pricing workbench
├── lib/
│   ├── efficientFrontier.ts     # covariance, opportunity set, frontier, and CML
│   ├── marketDataClient.ts      # authenticated, credit-aware REST boundary
│   ├── monteCarlo.ts            # seeded log-return simulation
│   ├── optionChain.ts            # quote quality and IV analytics
│   ├── optionPriceSurface.ts     # deterministic BSM sensitivity grid
│   ├── portfolioCalculations.ts # pure portfolio analytics
│   └── stockData.ts             # market-data boundary
└── utils/pricing.ts             # pure BSM and CRR models
```

The UI depends on route contracts, routes orchestrate external data, and all financial calculations live in pure modules with focused tests.

The market-data adapter follows Market Data's official [authentication](https://www.marketdata.app/docs/api/authentication/), [stock candle](https://www.marketdata.app/docs/api/stocks/candles/), [delayed stock quote](https://www.marketdata.app/docs/api/stocks/quotes/), and [option-chain](https://www.marketdata.app/docs/api/options/chain/) contracts. Chain requests are limited to one side and the 40 strikes nearest the money to preserve the free daily credit budget.

## Run locally

Requires Node.js 22+.

```bash
cd quant
npm ci
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The options calculator starts with a manual spot value and needs no configuration.

The AAPL quote, history, and option-chain demo works without credentials. For other symbols, copy the example environment file and add a [free Market Data token](https://www.marketdata.app/docs/account/plans/free-forever/):

```bash
cp .env.example .env.local
```

```env
MARKETDATA_TOKEN=your_token
```

`MARKETDATA_TOKEN` is intentionally server-only; do not rename it with a `NEXT_PUBLIC_` prefix. The Free Forever plan currently provides 100 daily credits, 24-hour-delayed data, and one year of history. The interface displays provider timestamps and requests only 40 near-the-money contracts at a time.

## Verify

```bash
npm run check
npm run build
```

Or run the checks independently:

```bash
npm run lint
npm run typecheck
npm test
```

## Model assumptions and limitations

- Black-Scholes-Merton assumes lognormal prices, constant volatility/rates/yield, frictionless markets, and European exercise.
- The CRR model supports early exercise but still assumes constant model inputs over the tree.
- The price heatmap is a Black-Scholes sensitivity grid, not a forecast or a historical scenario distribution.
- Midpoint IV is a European BSM equivalent. American exercise, discrete dividends, stale/crossed quotes, and wide markets can create differences from the provider IV.
- Portfolio histories use split-adjusted daily closes from Market Data and an SPY benchmark. Results depend on overlapping observations only.
- Free-tier quotes and chains are research snapshots delayed by at least 24 hours. They are unsuitable for execution decisions.
- VaR is historical and is not a maximum-loss estimate. The Monte Carlo model fits a normal distribution to daily log returns; it does not model volatility clustering, jumps, liquidity, fees, slippage, or market impact.
- The efficient frontier is an in-sample, long-only approximation generated from arithmetic historical means and a sample covariance matrix. Estimation error, regime changes, transaction costs, constraints, and out-of-sample performance are not modeled.
- This is a research and education tool, not investment advice or an execution system.

## License

[MIT](LICENSE)
