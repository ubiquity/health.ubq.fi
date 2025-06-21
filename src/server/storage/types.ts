/**
 * Health monitoring data types for Deno Deploy
 */

export interface HealthCheckResult {
  healthy: boolean
  status: number
  error?: string
  lastChecked: string
  checkedBy?: string
}

export interface AppHealth extends HealthCheckResult {
  name: string
  domain: string
  appType?: string
  denoExists?: boolean
  pagesExists?: boolean
}

export interface PluginHealth extends HealthCheckResult {
  name: string
  variant: string
  domain: string
  manifestValid?: boolean
  displayName?: string
  description?: string
}

export interface CachedHealthData {
  apps: { [key: string]: AppHealth }
  plugins: { [key: string]: PluginHealth }
  lastGlobalUpdate: string
}

export interface AppsListResponse {
  apps: string[]
  plugins: {
    name: string
    variants: string[]
    url: string
    routingDomain: string
    displayName?: string
    description?: string
  }[]
  others: string[]
  timestamp: string
}

export interface ProxyStatusResponse {
  healthy: boolean
  status: number
  statusText: string
  deploymentStatus: string
  error?: string
  timestamp: string
  diagnostics?: {
    url: string
    attempt?: number
    timeout?: number
    finalError?: string
  }
}

export interface ProxyManifestResponse {
  manifestValid: boolean
  status: number
  statusText: string
  manifest?: any
  error?: string
  timestamp: string
}

export interface UpdateHealthRequest {
  type: 'app' | 'plugin'
  key: string
  result: HealthCheckResult
}

export interface LegacyHealthResponse {
  lastUpdated: string
  apps: AppHealth[]
  plugins: PluginHealth[]
  summary: {
    totalApps: number
    healthyApps: number
    totalPlugins: number
    healthyPlugins: number
    overallHealthPercentage: number
  }
}
