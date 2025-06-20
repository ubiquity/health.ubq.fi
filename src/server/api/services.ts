/**
 * Services list endpoint
 */

import { getServicesFromRouter } from '../utils/router-api.ts'

import { checkServiceHealth } from '../utils/health-checker.ts'

export async function handleGetServices(): Promise<Response> {
  try {
    const services = await getServicesFromRouter()

    return new Response(JSON.stringify(services), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300',
        'Access-Control-Allow-Origin': '*'
      }
    })
  } catch (error) {
    console.error('Error getting services list:', error)
    return new Response(JSON.stringify({
      error: 'Failed to get services list',
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

export async function handleGetServiceHealth(domain: string): Promise<Response> {
  try {
    const health = await checkServiceHealth(domain)

    return new Response(JSON.stringify(health), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        'Access-Control-Allow-Origin': '*'
      }
    })
  } catch (error) {
    console.error(`Error checking health for ${domain}:`, error)
    return new Response(JSON.stringify({
      error: 'Failed to check service health',
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
