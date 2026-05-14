// ═══════════════════════════════════════════════════════════════════════
//  NETWORK HELPER — retry on transient failures (laptop wake, WiFi reconnect)
// ═══════════════════════════════════════════════════════════════════════

export async function fetchWithRetry(url, options = {}, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, options)
      return res  // success — return even if HTTP 4xx/5xx (caller handles)
    } catch (err) {
      if (attempt < maxRetries) {
        // Wait 1s, 2s before retry — gives WiFi time to reconnect
        await new Promise(r => setTimeout(r, attempt * 1000))
      } else {
        throw err  // all retries exhausted
      }
    }
  }
}
