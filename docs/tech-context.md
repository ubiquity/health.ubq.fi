# Tech Context

This document outlines the technologies used, development setup, technical constraints, and dependencies for health.ubq.fi.

## Technologies
- **Runtime**: Deno
- **Languages**: TypeScript, JavaScript
- **Storage**: Deno KV
- **Frontend**: Vanilla JS + HTML

## Development Setup
1. Install Deno: `brew install deno`
2. Clone repository: `git clone https://github.com/ubiquity/health.ubq.fi`
3. Run development server: `deno task dev`
4. Access dashboard at `http://localhost:8000`

## Constraints
- Requires Deno runtime (v1.30+)
- KV storage requires Deno Deploy for persistence
- Dashboard must remain lightweight (no frameworks)

## API Endpoints

### Health Monitoring
- `GET /api/apps` - List all apps and plugins
  - Returns: `AppsListResponse`
- `GET /api/health/{domain}` - Check health of specific app/plugin
  - Returns: `ProxyStatusResponse`
- `GET /health/cache` - Get cached health data
  - Returns: `CachedHealthData`
- `POST /health/update` - Update health status (internal use)
  - Body: `UpdateHealthRequest`

### Legacy Support
- `GET /json` - Legacy health endpoint
  - Returns: `LegacyHealthResponse`

## Dependencies
- **External Services**: None (self-contained)
- **Third-party APIs**: Health check endpoints of Ubiquity apps
- **Key Integrations**: Deno KV, Fetch API