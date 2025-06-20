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
    
    const data = await response.json()
    
    // Extract unique subdomains from all URLs in the sitemap
    const services = new Set<string>()
    
    // Handle different possible sitemap structures
    const urls: string[] = []
    
    // If it's an array of URLs
    if (Array.isArray(data)) {
      urls.push(...data.filter(item => typeof item === 'string'))
    }
    // If it's an array of objects with url property
    else if (Array.isArray(data) && data.length > 0 && typeof data[0] === 'object') {
      urls.push(...data.map(item => item.url || item.loc || '').filter(Boolean))
    }
    // If it's an object with urls property
    else if (data.urls && Array.isArray(data.urls)) {
      urls.push(...data.urls)
    }
    // If it's an object with urlset property (standard sitemap format)
    else if (data.urlset && Array.isArray(data.urlset)) {
      urls.push(...data.urlset.map((item: any) => item.loc || '').filter(Boolean))
    }
    
    // Extract subdomains from URLs
    for (const url of urls) {
      const subdomain = extractSubdomain(url)
      if (subdomain !== null) {
        services.add(subdomain)
      }
    }
    
    return Array.from(services).sort()
    
  } catch (error) {
    console.error('Error fetching services from sitemap:', error)
    // Return fallback static list if fetch fails
    return getFallbackServices()
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
    
    const data = await response.json()
    const plugins: ServicesListResponse['plugins'] = []
    
    // Handle different possible plugin map structures
    if (Array.isArray(data)) {
      // If it's an array of plugin objects
      for (const plugin of data) {
        if (typeof plugin === 'object' && plugin.name) {
          plugins.push({
            name: plugin.name,
            url: plugin.url || `https://os-${plugin.name}.ubq.fi`,
            routingDomain: plugin.routingDomain || plugin.domain || `os-${plugin.name}.ubq.fi`,
            variants: plugin.variants || ['main'],
            displayName: plugin.displayName || plugin.name,
            description: plugin.description || ''
          })
        }
      }
    } else if (typeof data === 'object') {
      // If it's an object with plugin names as keys
      for (const [name, plugin] of Object.entries(data)) {
        if (typeof plugin === 'object') {
          plugins.push({
            name: name,
            url: (plugin as any).url || `https://os-${name}.ubq.fi`,
            routingDomain: (plugin as any).routingDomain || (plugin as any).domain || `os-${name}.ubq.fi`,
            variants: (plugin as any).variants || ['main'],
            displayName: (plugin as any).displayName || name,
            description: (plugin as any).description || ''
          })
        } else if (typeof plugin === 'string') {
          // If the value is just a URL string
          plugins.push({
            name: name,
            url: plugin,
            routingDomain: new URL(plugin).hostname,
            variants: ['main'],
            displayName: name,
            description: ''
          })
        }
      }
    }
    
    return plugins
    
  } catch (error) {
    console.error('Error fetching plugins from plugin map:', error)
    // Return fallback static list if fetch fails
    return getFallbackPlugins()
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
 * Fallback static services list
 */
function getFallbackServices(): string[] {
  return [
    '', // root domain (ubq.fi)
    'pay',
    'www',
    'dao',
    'app',
    'work',
    'audit',
    'onboard',
    'keygen',
    'leaderboard',
    'safe',
    'uusd',
    'notifications',
    'permit2-allowance',
    'partner',
    'xp',
  ]
}

/**
 * Fallback static plugins list
 */
function getFallbackPlugins(): ServicesListResponse['plugins'] {
  return [
    {
      name: 'daemon-pricing',
      url: 'https://os-daemon-pricing.ubq.fi',
      routingDomain: 'os-daemon-pricing.ubq.fi',
      variants: ['main'],
      displayName: 'Daemon Pricing',
      description: 'Automated pricing daemon for issue bounties'
    },
    {
      name: 'permit-generation',
      url: 'https://os-permit-generation.ubq.fi',
      routingDomain: 'os-permit-generation.ubq.fi',
      variants: ['main'],
      displayName: 'Permit Generation',
      description: 'Generate permits for payout distributions'
    },
    {
      name: 'conversation-rewards',
      url: 'https://os-conversation-rewards.ubq.fi',
      routingDomain: 'os-conversation-rewards.ubq.fi',
      variants: ['main'],
      displayName: 'Conversation Rewards',
      description: 'Calculate rewards for GitHub conversations'
    },
    {
      name: 'issue-comment-embeddings',
      url: 'https://os-issue-comment-embeddings.ubq.fi',
      routingDomain: 'os-issue-comment-embeddings.ubq.fi',
      variants: ['main'],
      displayName: 'Issue Comment Embeddings',
      description: 'Generate embeddings for issue comments'
    },
    {
      name: 'user-activity-watcher',
      url: 'https://os-user-activity-watcher.ubq.fi',
      routingDomain: 'os-user-activity-watcher.ubq.fi',
      variants: ['main'],
      displayName: 'User Activity Watcher',
      description: 'Monitor user activity and contributions'
    },
    {
      name: 'assistive-pricing',
      url: 'https://os-assistive-pricing.ubq.fi',
      routingDomain: 'os-assistive-pricing.ubq.fi',
      variants: ['main'],
      displayName: 'Assistive Pricing',
      description: 'AI-assisted pricing recommendations'
    },
    {
      name: 'automated-merging',
      url: 'https://os-automated-merging.ubq.fi',
      routingDomain: 'os-automated-merging.ubq.fi',
      variants: ['main'],
      displayName: 'Automated Merging',
      description: 'Automated pull request merging'
    },
    {
      name: 'text-conversation-rewards',
      url: 'https://os-text-conversation-rewards.ubq.fi',
      routingDomain: 'os-text-conversation-rewards.ubq.fi',
      variants: ['main'],
      displayName: 'Text Conversation Rewards',
      description: 'Text-based conversation reward calculation'
    },
    {
      name: 'disqualify-handler',
      url: 'https://os-disqualify-handler.ubq.fi',
      routingDomain: 'os-disqualify-handler.ubq.fi',
      variants: ['main'],
      displayName: 'Disqualify Handler',
      description: 'Handle contributor disqualifications'
    },
    {
      name: 'comment-incentives',
      url: 'https://os-comment-incentives.ubq.fi',
      routingDomain: 'os-comment-incentives.ubq.fi',
      variants: ['main'],
      displayName: 'Comment Incentives',
      description: 'Incentive system for quality comments'
    }
  ]
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
