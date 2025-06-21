/// <reference lib="deno.ns" />

/**
 * UBQ.FI Health Monitor - Deno Deploy Entry Point
 * Standalone health monitoring application
 */

import { handleGetApps, handleGetAppHealth } from './api/apps.ts'
import { handleGetCache } from './api/cache.ts'
import { handleUpdateHealth } from './api/update.ts'
import { handleProxyStatus, handleProxyManifest } from './api/proxy.ts'
import { handleLegacyHealthApi } from './api/legacy.ts'

async function handleRequest(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const path = url.pathname

  // Handle CORS preflight requests
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '86400'
      }
    })
  }

  try {
    // Health API endpoints
    if (path === '/api/apps') {
      return await handleGetApps()
    } else if (path === '/health/cache') {
      return await handleGetCache()
    } else if (path === '/health/update') {
      return await handleUpdateHealth(request)
    } else if (path === '/health/proxy/status') {
      return await handleProxyStatus(url)
    } else if (path === '/health/proxy/manifest') {
      return await handleProxyManifest(url)
    } else if (path === '/json') {
      // Legacy endpoint for compatibility
      return await handleLegacyHealthApi()
    } else if (path === '/' || path === '/index.html') {
      // Health dashboard
      return await handleHealthDashboard()
    } else if (path.startsWith('/api/health/')) {
      const domain = path.replace('/api/health/', '')
      return await handleGetAppHealth(domain)
    } else if (path === '/health-checker.js') {
      // Health dashboard JavaScript
      return await handleHealthDashboard(path)
    }

    return new Response('Not found', { status: 404 })
  } catch (error) {
    console.error('Request handler error:', error)
    return new Response(JSON.stringify({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    })
  }
}

async function handleHealthDashboard(path: string = '/'): Promise<Response> {
  if (path === '/health-checker.js') {
    const jsContent = await Deno.readTextFile('./src/client/dashboard/health-checker.js')
    return new Response(jsContent, {
      headers: {
        'Content-Type': 'application/javascript',
        'Cache-Control': 'public, max-age=300'
      }
    })
  }

  const dashboardHtml = await Deno.readTextFile('./src/client/dashboard/index.html')

  return new Response(dashboardHtml, {
    headers: {
      'Content-Type': 'text/html',
      'Cache-Control': 'public, max-age=300' // Cache for 5 minutes
    }
  })
}

// Export the handler as default for Deno Deploy
export default { fetch: handleRequest }

// For local development, Deno.serve is now implicitly called by the task runner
