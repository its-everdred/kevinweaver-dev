/**
 * The one place a bundle file is asked for over the network.
 *
 * The distinction this module exists to draw is between a server that answered
 * "there is no such file" and a request that never got an answer at all. The
 * loader used to see both as `null` and treat both as the end of history, which
 * on a phone is wrong roughly 188 times per page load: the event pump is 94
 * chunks fetched one after another, and a single dropped connection out of
 * those 188 requests permanently truncated the galaxy to whatever had landed.
 * A 404 is a fact about the deployment; a connection reset is a fact about the
 * radio, and the radio is worth asking again.
 */

/** What one request for a bundle file came back with. */
export type TextFetch =
  | { readonly ok: true; readonly text: string }
  /**
   * No body. `transient` is true when the request failed rather than being
   * refused — a network error, or a 5xx from the edge — and so may succeed on a
   * later attempt. False means the server answered, and the answer was no.
   */
  | { readonly ok: false; readonly transient: boolean }

/**
 * Attempts per request, including the first. Three covers the common phone
 * failure — one connection dropped as the radio changes cell or the tab is
 * briefly backgrounded — without turning a genuinely offline device into a
 * request storm.
 */
export const FETCH_ATTEMPTS = 3
/** Delay before the second attempt; the third waits twice as long. */
export const FETCH_BACKOFF_MS = 150

/**
 * @description Fetches one bundle file as text, retrying a failed request a
 * bounded number of times before reporting that it did not arrive.
 * @param fetchImpl The fetch to use, so callers can inject one.
 * @param url Same-origin path to the file.
 * @param signal Abort signal; an abort ends the attempts at once and rethrows,
 * which is how a disposed loader stops rather than finishing its retries.
 * @returns The body, or why there is none.
 */
export async function fetchText(
  fetchImpl: typeof fetch,
  url: string,
  signal: AbortSignal
): Promise<TextFetch> {
  let result = await attemptText(fetchImpl, url, signal)
  for (let attempt = 1; attempt < FETCH_ATTEMPTS; attempt += 1) {
    if (result.ok || !result.transient || signal.aborted) return result
    await sleep(FETCH_BACKOFF_MS << (attempt - 1), signal)
    if (signal.aborted) return result
    result = await attemptText(fetchImpl, url, signal)
  }
  return result
}

/** One request. Consumes the body so a refused response holds no connection. */
async function attemptText(
  fetchImpl: typeof fetch,
  url: string,
  signal: AbortSignal
): Promise<TextFetch> {
  try {
    const response = await fetchImpl(url, { credentials: 'omit', signal })
    if (response.ok) return { ok: true, text: await response.text() }
    await response.text()
    // 4xx is the deployment's answer and will not change under this page load;
    // 5xx is the edge having a bad moment and is worth one more try.
    return { ok: false, transient: response.status >= 500 }
  } catch (error) {
    if (signal.aborted) throw error
    return { ok: false, transient: true }
  }
}

/** A delay that ends early on abort, so `dispose()` is never waited out. */
function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const done = (): void => {
      clearTimeout(timer)
      signal.removeEventListener('abort', done)
      resolve()
    }
    const timer = setTimeout(done, ms)
    signal.addEventListener('abort', done, { once: true })
  })
}
