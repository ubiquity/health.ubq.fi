/**
 * Dynamic services and plugins fetcher from live endpoints
 */

import type { ServicesListResponse } from '../storage/types.ts'

// Cache configuration
const CACHE_DURATION = 5 * 60 * 1000 // 5 minutes
let cache: {
  data: ServicesListResponse | null
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
 * Fetch and parse services from sitemap.json
 */
async function fetchServices(): Promise<string[]> {
  try {
    const response = await fetch('https://ubq.fi/sitemap.json', {
      signal: AbortSignal.timeout(10000) // 10 second timeout
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch sitemap: ${response.status} ${response.statusText}`)
    }

    const data = await response.json();
    const services = new Set<string>();

    if (data.urls && Array.isArray(data.urls)) {
      for (const item of data.urls) {
        const subdomain = extractSubdomain(item.url);
        if (subdomain !== null) {
          services.add(subdomain);
        }
      }
    }

    return Array.from(services).sort();

  } catch (error) {
    console.error('Error fetching services from sitemap:', error);
    return []; // Return empty array on error
  }
}

/**
 * Fetch and parse plugins from plugin-map.json
 */
async function fetchPlugins(): Promise<ServicesListResponse['plugins']> {
  try {
    const response = await fetch('https://ubq.fi/plugin-map.json', {
      signal: AbortSignal.timeout(10000) // 10 second timeout
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch plugin map: ${response.status} ${response.statusText}`)
    }

    const data = await response.json();
    const plugins: ServicesListResponse['plugins'] = [];

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
    return plugins;

  } catch (error) {
    console.error('Error fetching plugins from plugin map:', error);
    return []; // Return empty array on error
  }
}

/**
 * Get services and plugins dynamically with caching
 */
export async function getServicesFromRouter(): Promise<ServicesListResponse> {
  // Check cache validity
  const now = Date.now()
  if (cache.data && (now - cache.timestamp) < CACHE_DURATION) {
    return cache.data
  }

  // Fetch fresh data
  const [services, plugins] = await Promise.all([
    fetchServices(),
    fetchPlugins()
  ])

  const response: ServicesListResponse = {
    services,
    plugins,
    others: [],
    timestamp: new Date().toISOString()
  }

  // Update cache
  cache = {
    data: response,
    timestamp: now
  }

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
