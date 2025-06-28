/**
 * Dynamic apps and plugins fetcher from live endpoints
 */

import type { AppsListResponse } from '../storage/types.ts'

// Cache configuration
const CACHE_DURATION = 5 * 60 * 1000 // 5 minutes
let cache: {
  data: AppsListResponse | null
  timestamp: number
} = {
  data: null,
  timestamp: 0
}

/**
 * Extract subdomain from URL
 * @param url - Full URL like https://pay.ubq.fi
 * @returns Subdomain like 'pay' or empty string for root domain
 */
function extractSubdomain(url: string): string {
  try {
    const parsedUrl = new URL(url)
    const hostname = parsedUrl.hostname

    // Handle root domain (ubq.fi)
    if (hostname === 'ubq.fi') {
      return ''
    }

    // Extract subdomain from hostname like pay.ubq.fi -> pay
    const parts = hostname.split('.')
    if (parts.length >= 3 && parts[parts.length - 2] === 'ubq' && parts[parts.length - 1] === 'fi') {
      return parts.slice(0, -2).join('.')
    }

    return ''
  } catch {
    return ''
  }
}

/**
 * Fetch and parse apps from sitemap.json
 */
async function fetchApps(): Promise<string[]> {
  const startTime = Date.now()
  const url = 'https://ubq.fi/sitemap.json'

  console.log(`[SITEMAP_FETCH] Starting request to ${url}`)

  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(60000) // 60 second timeout
    })

    const responseTime = Date.now() - startTime
    console.log(`[SITEMAP_FETCH] Request completed in ${responseTime}ms`)

    if (!response.ok) {
      console.error(`[SITEMAP_FETCH] HTTP Error ${response.status}: ${response.statusText}`)
      const headersObj: Record<string, string> = {}
      response.headers.forEach((value, key) => {
        headersObj[key] = value
      })
      console.error(`[SITEMAP_FETCH] Response headers:`, headersObj)

      try {
        const responseText = await response.text()
        console.error(`[SITEMAP_FETCH] Response body:`, responseText.substring(0, 500))
      } catch (textError) {
        console.error(`[SITEMAP_FETCH] Failed to read response body:`, textError)
      }

      console.error(`[SITEMAP_FETCH] Network error type: HTTP_ERROR`)
      throw new Error(`Failed to fetch sitemap: ${response.status} ${response.statusText}`)
    }

    const data = await response.json();
    const apps = new Set<string>();

    if (data.urls && Array.isArray(data.urls)) {
      for (const item of data.urls) {
        const subdomain = extractSubdomain(item.url);
        if (subdomain !== null) {
          apps.add(subdomain);
        }
      }
    }

    console.log(`[SITEMAP_FETCH] Successfully parsed ${apps.size} apps`)
    return Array.from(apps).sort();

  } catch (error) {
    const responseTime = Date.now() - startTime
    console.error(`[SITEMAP_FETCH] Request failed after ${responseTime}ms`)

    if (error instanceof TypeError && error.message.includes('fetch')) {
      console.error(`[SITEMAP_FETCH] Network error type: NETWORK_ERROR`)
      console.error(`[SITEMAP_FETCH] Possible DNS or connection failure`)
    } else if (error instanceof DOMException && error.name === 'TimeoutError') {
      console.error(`[SITEMAP_FETCH] Network error type: TIMEOUT_ERROR`)
      console.error(`[SITEMAP_FETCH] Request exceeded 60 second timeout`)
    } else if (error instanceof SyntaxError) {
      console.error(`[SITEMAP_FETCH] Network error type: PARSE_ERROR`)
      console.error(`[SITEMAP_FETCH] Failed to parse JSON response`)
    } else {
      console.error(`[SITEMAP_FETCH] Network error type: UNKNOWN_ERROR`)
    }

    console.error(`[SITEMAP_FETCH] Error details:`, error);
    return []; // Return empty array on error
  }
}

/**
 * Fetch and parse plugins from plugin-map.json
 */
async function fetchPlugins(): Promise<AppsListResponse['plugins']> {
  const startTime = Date.now()
  const url = 'https://ubq.fi/plugin-map.json'

  console.log(`[PLUGIN_FETCH] Starting request to ${url}`)

  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(60000) // 60 second timeout
    })

    const responseTime = Date.now() - startTime
    console.log(`[PLUGIN_FETCH] Request completed in ${responseTime}ms`)

    if (!response.ok) {
      console.error(`[PLUGIN_FETCH] HTTP Error ${response.status}: ${response.statusText}`)
      const headersObj: Record<string, string> = {}
      response.headers.forEach((value, key) => {
        headersObj[key] = value
      })
      console.error(`[PLUGIN_FETCH] Response headers:`, headersObj)

      try {
        const responseText = await response.text()
        console.error(`[PLUGIN_FETCH] Response body:`, responseText.substring(0, 500))
      } catch (textError) {
        console.error(`[PLUGIN_FETCH] Failed to read response body:`, textError)
      }

      console.error(`[PLUGIN_FETCH] Network error type: HTTP_ERROR`)
      throw new Error(`Failed to fetch plugin map: ${response.status} ${response.statusText}`)
    }

    const data = await response.json();
    const plugins: AppsListResponse['plugins'] = [];

    if (data.plugins && Array.isArray(data.plugins)) {
      for (const plugin of data.plugins) {
        plugins.push({
          name: plugin.pluginName,
          url: plugin.url,
          routingDomain: new URL(plugin.url).hostname,
          variants: plugin.deployments ? Object.keys(plugin.deployments) : ['main'],
          displayName: plugin.displayName,
          description: plugin.description
        });
      }
    }

    console.log(`[PLUGIN_FETCH] Successfully parsed ${plugins.length} plugins`)
    return plugins;

  } catch (error) {
    const responseTime = Date.now() - startTime
    console.error(`[PLUGIN_FETCH] Request failed after ${responseTime}ms`)

    if (error instanceof TypeError && error.message.includes('fetch')) {
      console.error(`[PLUGIN_FETCH] Network error type: NETWORK_ERROR`)
      console.error(`[PLUGIN_FETCH] Possible DNS or connection failure`)
    } else if (error instanceof DOMException && error.name === 'TimeoutError') {
      console.error(`[PLUGIN_FETCH] Network error type: TIMEOUT_ERROR`)
      console.error(`[PLUGIN_FETCH] Request exceeded 60 second timeout`)
    } else if (error instanceof SyntaxError) {
      console.error(`[PLUGIN_FETCH] Network error type: PARSE_ERROR`)
      console.error(`[PLUGIN_FETCH] Failed to parse JSON response`)
    } else {
      console.error(`[PLUGIN_FETCH] Network error type: UNKNOWN_ERROR`)
    }

    console.error(`[PLUGIN_FETCH] Error details:`, error);
    return []; // Return empty array on error
  }
}

/**
 * Get apps and plugins dynamically with caching
 */
export async function getAppsFromRouter(): Promise<AppsListResponse> {
  // Check cache validity
  const now = Date.now()
  const cacheAge = cache.data ? now - cache.timestamp : 0

  if (cache.data && cacheAge < CACHE_DURATION) {
    console.log(`[CACHE] Using cached data (age: ${Math.round(cacheAge / 1000)}s)`)
    return cache.data
  }

  console.log(`[CACHE] Cache ${cache.data ? 'expired' : 'empty'}, fetching fresh data`)

  // Fetch fresh data
  const fetchStartTime = Date.now()
  const [apps, plugins] = await Promise.all([
    fetchApps(),
    fetchPlugins()
  ])

  const fetchTime = Date.now() - fetchStartTime
  console.log(`[CACHE] Fresh data fetched in ${fetchTime}ms`)

  const response: AppsListResponse = {
    apps,
    plugins,
    others: [],
    timestamp: new Date().toISOString()
  }

  // Update cache
  cache = {
    data: response,
    timestamp: now
  }

  console.log(`[CACHE] Cache updated with ${apps.length} apps and ${plugins.length} plugins`)
  return response
}

/**
 * Clear the cache (useful for testing or forced refresh)
 */
export function clearCache(): void {
  cache = {
    data: null,
    timestamp: 0
  }
}
