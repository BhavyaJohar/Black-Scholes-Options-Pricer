const DEFAULT_BASE_URL = 'https://api.marketdata.app';
const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

type FetchImplementation = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export interface MarketDataClientOptions {
  token?: string;
  baseUrl?: string;
  fetchImplementation?: FetchImplementation;
  timeoutMs?: number;
  maxRetries?: number;
  sleep?: (milliseconds: number) => Promise<void>;
}

export interface RateLimitMetadata {
  consumed?: number;
  remaining?: number;
  limit?: number;
  resetAt?: string;
}

export interface AggregateBar {
  close: number;
  high: number;
  low: number;
  open: number;
  timestamp: number;
  volume: number;
}

export interface StockSnapshot {
  ticker: string;
  price: number;
  change?: number;
  changePercent?: number;
  updatedAt?: string;
  source: 'midpoint' | 'last-trade';
  rateLimit: RateLimitMetadata;
}

export interface OptionGreeksSnapshot {
  delta?: number;
  gamma?: number;
  theta?: number;
  vega?: number;
}

export interface OptionContractSnapshot {
  ticker: string;
  contractType: 'call' | 'put';
  exerciseStyle: 'unknown';
  expirationDate: string;
  strikePrice: number;
  sharesPerContract: number;
  bid?: number;
  ask?: number;
  midpoint?: number;
  quoteTimeframe?: string;
  impliedVolatility?: number;
  openInterest?: number;
  volume?: number;
  underlyingPrice?: number;
  underlyingTimeframe?: string;
  greeks?: OptionGreeksSnapshot;
}

export interface OptionChainQuery {
  ticker: string;
  expirationDate: string;
  contractType: 'call' | 'put';
  strikeLimit?: number;
}

export interface OptionChainResult {
  contracts: OptionContractSnapshot[];
  updatedAt?: string;
  rateLimit: RateLimitMetadata;
}

interface UnknownRecord {
  [key: string]: unknown;
}

interface ResponseEnvelope {
  payload: unknown;
  rateLimit: RateLimitMetadata;
}

export class MarketDataApiError extends Error {
  readonly status: number;
  readonly retryable: boolean;
  readonly rateLimit: RateLimitMetadata;

  constructor(message: string, status: number, rateLimit: RateLimitMetadata = {}) {
    super(message);
    this.name = 'MarketDataApiError';
    this.status = status;
    this.retryable = RETRYABLE_STATUS.has(status);
    this.rateLimit = rateLimit;
  }
}

export class MarketDataResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MarketDataResponseError';
  }
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function optionalFinite(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function finiteAt(value: unknown, index: number): number | undefined {
  return Array.isArray(value) ? optionalFinite(value[index]) : undefined;
}

function stringAt(value: unknown, index: number): string | undefined {
  const candidate = Array.isArray(value) ? value[index] : undefined;
  return typeof candidate === 'string' && candidate.length > 0 ? candidate : undefined;
}

function requiredFiniteAt(value: unknown, index: number, field: string): number {
  const candidate = finiteAt(value, index);
  if (candidate === undefined) {
    throw new MarketDataResponseError(`Market Data returned invalid ${field}[${index}]`);
  }
  return candidate;
}

function requiredStringAt(value: unknown, index: number, field: string): string {
  const candidate = stringAt(value, index);
  if (candidate === undefined) {
    throw new MarketDataResponseError(`Market Data returned invalid ${field}[${index}]`);
  }
  return candidate;
}

function normalizeTicker(ticker: string): string {
  const normalized = ticker.trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9./-]{0,9}$/.test(normalized)) {
    throw new TypeError('Ticker must be 1-10 letters, digits, dots, slashes, or hyphens');
  }
  return normalized;
}

function isoFromUnixSeconds(value: unknown): string | undefined {
  const seconds = optionalFinite(value);
  if (seconds === undefined || seconds <= 0) return undefined;
  const date = new Date(seconds * 1_000);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function dateFromUnixSeconds(value: number): string {
  const iso = isoFromUnixSeconds(value);
  if (!iso) throw new MarketDataResponseError('Market Data returned an invalid expiration timestamp');
  return iso.slice(0, 10);
}

function parseHeaderNumber(headers: Headers, name: string): number | undefined {
  const value = headers.get(name);
  if (value === null) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseRateLimit(headers: Headers): RateLimitMetadata {
  const resetSeconds = parseHeaderNumber(headers, 'x-api-ratelimit-reset');
  return {
    consumed: parseHeaderNumber(headers, 'x-api-ratelimit-consumed'),
    remaining: parseHeaderNumber(headers, 'x-api-ratelimit-remaining'),
    limit: parseHeaderNumber(headers, 'x-api-ratelimit-limit'),
    resetAt: resetSeconds === undefined ? undefined : isoFromUnixSeconds(resetSeconds),
  };
}

function payloadError(payload: unknown, fallback: string): string {
  if (!isRecord(payload)) return fallback;
  return typeof payload.errmsg === 'string' ? payload.errmsg : fallback;
}

function assertOkPayload(payload: unknown): UnknownRecord {
  if (!isRecord(payload)) throw new MarketDataResponseError('Market Data returned a non-object response');
  if (payload.s === 'error') {
    throw new MarketDataResponseError(payloadError(payload, 'Market Data rejected the request'));
  }
  if (payload.s === 'no_data') {
    throw new MarketDataResponseError('Market Data returned no data for this request');
  }
  if (payload.s !== 'ok') throw new MarketDataResponseError('Market Data returned an unknown status');
  return payload;
}

function parseAggregateBars(payload: unknown): AggregateBar[] {
  const record = assertOkPayload(payload);
  if (!Array.isArray(record.t)) throw new MarketDataResponseError('Market Data candle response is missing timestamps');
  return record.t.map((_, index) => {
    const close = requiredFiniteAt(record.c, index, 'c');
    const high = requiredFiniteAt(record.h, index, 'h');
    const low = requiredFiniteAt(record.l, index, 'l');
    const open = requiredFiniteAt(record.o, index, 'o');
    const timestampSeconds = requiredFiniteAt(record.t, index, 't');
    const volume = requiredFiniteAt(record.v, index, 'v');
    if (close <= 0 || high <= 0 || low <= 0 || open <= 0 || timestampSeconds <= 0 || volume < 0) {
      throw new MarketDataResponseError(`Market Data returned an out-of-range candle[${index}]`);
    }
    return { close, high, low, open, timestamp: timestampSeconds * 1_000, volume };
  });
}

function parseStockSnapshot(payload: unknown, expectedTicker: string, rateLimit: RateLimitMetadata): StockSnapshot {
  const record = assertOkPayload(payload);
  const ticker = stringAt(record.symbol, 0) ?? expectedTicker;
  const midpoint = finiteAt(record.mid, 0);
  const lastTrade = finiteAt(record.last, 0);
  const price = midpoint ?? lastTrade;
  if (price === undefined || price <= 0) {
    throw new MarketDataResponseError('Market Data stock quote contains no usable price');
  }
  return {
    ticker,
    price,
    change: finiteAt(record.change, 0),
    changePercent: finiteAt(record.changepct, 0),
    updatedAt: isoFromUnixSeconds(finiteAt(record.updated, 0)),
    source: midpoint !== undefined ? 'midpoint' : 'last-trade',
    rateLimit,
  };
}

function parseGreeks(record: UnknownRecord, index: number): OptionGreeksSnapshot | undefined {
  const greeks = {
    delta: finiteAt(record.delta, index),
    gamma: finiteAt(record.gamma, index),
    theta: finiteAt(record.theta, index),
    vega: finiteAt(record.vega, index),
  };
  return Object.values(greeks).some((value) => value !== undefined) ? greeks : undefined;
}

function parseOptionChain(payload: unknown, rateLimit: RateLimitMetadata): OptionChainResult {
  const record = assertOkPayload(payload);
  if (!Array.isArray(record.optionSymbol)) {
    throw new MarketDataResponseError('Market Data option-chain response is missing optionSymbol');
  }
  const updatedTimes: number[] = [];
  const contracts = record.optionSymbol.map((_, index): OptionContractSnapshot => {
    const contractType = stringAt(record.side, index);
    if (contractType !== 'call' && contractType !== 'put') {
      throw new MarketDataResponseError(`Market Data returned invalid side[${index}]`);
    }
    const updated = finiteAt(record.updated, index);
    if (updated !== undefined) updatedTimes.push(updated);
    return {
      ticker: requiredStringAt(record.optionSymbol, index, 'optionSymbol'),
      contractType,
      exerciseStyle: 'unknown',
      expirationDate: dateFromUnixSeconds(requiredFiniteAt(record.expiration, index, 'expiration')),
      strikePrice: requiredFiniteAt(record.strike, index, 'strike'),
      sharesPerContract: 100,
      bid: finiteAt(record.bid, index),
      ask: finiteAt(record.ask, index),
      midpoint: finiteAt(record.mid, index),
      quoteTimeframe: '24-hour delayed on Free Forever',
      impliedVolatility: finiteAt(record.iv, index),
      openInterest: finiteAt(record.openInterest, index),
      volume: finiteAt(record.volume, index),
      underlyingPrice: finiteAt(record.underlyingPrice, index),
      underlyingTimeframe: '24-hour delayed on Free Forever',
      greeks: parseGreeks(record, index),
    };
  });
  const latestUpdate = updatedTimes.length === 0 ? undefined : Math.max(...updatedTimes);
  return { contracts, updatedAt: isoFromUnixSeconds(latestUpdate), rateLimit };
}

export class MarketDataRestClient {
  private readonly token?: string;
  private readonly baseUrl: URL;
  private readonly fetchImplementation: FetchImplementation;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly sleep: (milliseconds: number) => Promise<void>;

  constructor({
    token,
    baseUrl = DEFAULT_BASE_URL,
    fetchImplementation = fetch,
    timeoutMs = 10_000,
    maxRetries = 2,
    sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  }: MarketDataClientOptions = {}) {
    if (token !== undefined && !token.trim()) throw new TypeError('MARKETDATA_TOKEN cannot be blank');
    if (!Number.isFinite(timeoutMs) || timeoutMs < 100 || timeoutMs > 60_000) {
      throw new RangeError('timeoutMs must be between 100 and 60000');
    }
    if (!Number.isInteger(maxRetries) || maxRetries < 0 || maxRetries > 5) {
      throw new RangeError('maxRetries must be an integer between 0 and 5');
    }
    this.token = token;
    this.baseUrl = new URL(baseUrl);
    this.fetchImplementation = fetchImplementation;
    this.timeoutMs = timeoutMs;
    this.maxRetries = maxRetries;
    this.sleep = sleep;
  }

  private async request(url: URL): Promise<ResponseEnvelope> {
    if (url.origin !== this.baseUrl.origin) throw new TypeError('Refusing a Market Data URL on another origin');
    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      let response: Response;
      try {
        const headers: Record<string, string> = { Accept: 'application/json' };
        if (this.token) headers.Authorization = `Bearer ${this.token}`;
        response = await this.fetchImplementation(url, {
          headers,
          signal: AbortSignal.timeout(this.timeoutMs),
        });
      } catch (error: unknown) {
        if (attempt < this.maxRetries) {
          await this.sleep(250 * 2 ** attempt);
          continue;
        }
        throw new MarketDataApiError(
          error instanceof Error ? `Market Data request failed: ${error.message}` : 'Market Data request failed',
          503
        );
      }

      const payload: unknown = await response.json().catch(() => undefined);
      const rateLimit = parseRateLimit(response.headers);
      if (response.ok) return { payload, rateLimit };
      const fallbackMessage = response.status === 401 && !this.token
        ? 'Set MARKETDATA_TOKEN to use symbols other than the tokenless AAPL demo'
        : `Market Data request failed with HTTP ${response.status}`;
      const apiError = new MarketDataApiError(
        payloadError(payload, fallbackMessage),
        response.status,
        rateLimit
      );
      if (!apiError.retryable || attempt === this.maxRetries) throw apiError;
      const retryAfter = Number(response.headers.get('retry-after'));
      const delay = Number.isFinite(retryAfter) && retryAfter > 0
        ? Math.min(retryAfter * 1_000, 5_000)
        : 250 * 2 ** attempt;
      await this.sleep(delay);
    }
    throw new MarketDataApiError('Market Data retry budget exhausted', 503);
  }

  private createUrl(path: string, parameters: Record<string, string | number | boolean | undefined>): URL {
    const url = new URL(path, this.baseUrl);
    for (const [key, value] of Object.entries(parameters)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
    return url;
  }

  async getAggregateBars(ticker: string, from: string, to: string): Promise<AggregateBar[]> {
    const normalizedTicker = normalizeTicker(ticker);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
      throw new TypeError('Candle dates must use YYYY-MM-DD');
    }
    const url = this.createUrl(`/v1/stocks/candles/D/${encodeURIComponent(normalizedTicker)}/`, {
      from,
      to,
      adjustsplits: true,
      adjustdividends: false,
    });
    return parseAggregateBars((await this.request(url)).payload);
  }

  async getStockSnapshot(ticker: string): Promise<StockSnapshot> {
    const normalizedTicker = normalizeTicker(ticker);
    const url = this.createUrl(`/v1/stocks/quotes/${encodeURIComponent(normalizedTicker)}/`, {});
    const response = await this.request(url);
    return parseStockSnapshot(response.payload, normalizedTicker, response.rateLimit);
  }

  async getOptionChain({
    ticker,
    expirationDate,
    contractType,
    strikeLimit = 40,
  }: OptionChainQuery): Promise<OptionChainResult> {
    const normalizedTicker = normalizeTicker(ticker);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(expirationDate)) {
      throw new TypeError('Option expirationDate must use YYYY-MM-DD');
    }
    if (!Number.isInteger(strikeLimit) || strikeLimit < 5 || strikeLimit > 50) {
      throw new RangeError('strikeLimit must be an integer between 5 and 50');
    }
    const url = this.createUrl(`/v1/options/chain/${encodeURIComponent(normalizedTicker)}/`, {
      expiration: expirationDate,
      side: contractType,
      strikeLimit,
    });
    const response = await this.request(url);
    return parseOptionChain(response.payload, response.rateLimit);
  }
}

export function createMarketDataClient(): MarketDataRestClient {
  return new MarketDataRestClient({ token: process.env.MARKETDATA_TOKEN });
}
