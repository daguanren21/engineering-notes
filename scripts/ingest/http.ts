const userAgent =
  "EngineeringNotesDigest/1.0 (+https://github.com/daguanren21/engineering-notes)";

export class HttpError extends Error {
  // Written out rather than as a constructor parameter property: Node runs
  // these files with type stripping, which rejects that syntax while `tsc`
  // accepts it.
  readonly status: number;

  constructor(status: number, url: string, statusText: string) {
    super(`${status} ${statusText} for ${url}`);
    this.name = "HttpError";
    this.status = status;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const maxConcurrent = Math.max(1, Number(process.env.DIGEST_MAX_CONCURRENCY ?? 6));
let inFlight = 0;
const waiting: (() => void)[] = [];

/**
 * A whole run makes roughly 150 outbound requests across feeds and article
 * pages. Firing them all at once exhausts the socket pool and the failures look
 * random — a different set of feeds dies each run with "socket disconnected
 * before secure TLS connection was established". This caps how many are open.
 */
async function acquireSlot(): Promise<void> {
  if (inFlight >= maxConcurrent) {
    await new Promise<void>((resolve) => waiting.push(resolve));
    return;
  }
  inFlight += 1;
}

function releaseSlot(): void {
  const next = waiting.shift();
  // The woken waiter inherits this slot, so the count does not change.
  if (next) next();
  else inFlight -= 1;
}

/** 4xx is the source telling us to stop; network faults and 5xx get retried. */
function isWorthRetrying(error: unknown): boolean {
  if (error instanceof HttpError) return error.status >= 500;
  return true;
}

export async function fetchText(
  url: string,
  options: {
    timeoutMs?: number;
    headers?: Record<string, string>;
    attempts?: number;
    retryDelayMs?: number;
  } = {},
): Promise<string> {
  const { timeoutMs = 20_000, headers = {}, attempts = 3, retryDelayMs = 700 } = options;

  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    if (attempt > 1) await sleep(retryDelayMs * (attempt - 1));

    await acquireSlot();
    try {
      const response = await fetch(url, {
        headers: { "user-agent": userAgent, accept: "*/*", ...headers },
        // Started after the slot is held, or the timeout would burn while queued.
        signal: AbortSignal.timeout(timeoutMs),
        redirect: "follow",
      });

      if (!response.ok) {
        throw new HttpError(response.status, url, response.statusText);
      }

      return await response.text();
    } catch (error) {
      lastError = error;
      if (!isWorthRetrying(error)) break;
    } finally {
      releaseSlot();
    }
  }

  // A bare "fetch failed" tells the operator nothing; the cause carries the
  // timeout, DNS, or TLS reason.
  if (lastError instanceof Error && lastError.cause instanceof Error) {
    throw new Error(`${lastError.message}: ${lastError.cause.message}`, { cause: lastError });
  }
  throw lastError;
}

export async function fetchJson<T>(
  url: string,
  options: { timeoutMs?: number; headers?: Record<string, string> } = {},
): Promise<T> {
  const body = await fetchText(url, options);
  return JSON.parse(body) as T;
}

export async function postJson<T>(
  url: string,
  payload: unknown,
  options: { timeoutMs?: number; headers?: Record<string, string> } = {},
): Promise<T> {
  const { timeoutMs = 180_000, headers = {} } = options;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "user-agent": userAgent,
      "content-type": "application/json",
      accept: "application/json",
      ...headers,
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(timeoutMs),
  });

  const body = await response.text();
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${body.slice(0, 400)}`);
  }

  return JSON.parse(body) as T;
}

/** Turns "this failed, that failed" into one line without losing the reason. */
export async function settleWithReport<T>(
  label: string,
  task: () => Promise<T>,
  onError: (message: string) => void,
): Promise<T | null> {
  try {
    return await task();
  } catch (error) {
    onError(`${label}: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}
