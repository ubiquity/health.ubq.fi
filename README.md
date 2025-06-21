# UBQ.FI Health Monitor

A standalone Deno Deploy application for monitoring the health of all UBQ.FI apps and plugins.

## Features

- **Real-time Health Monitoring**: Tracks status of all UBQ.FI apps and plugins
- **Deno KV Storage**: Uses Deno's built-in KV store for persistent health data
- **Rate Limiting**: Built-in rate limiting to prevent excessive API calls
- **Fallback Mode**: Automatic fallback to localStorage when KV limits are hit
- **Client-side Checking**: Distributed health checking reduces server load
- **Legacy API Support**: Compatible with existing health dashboard endpoints

## Architecture

```
health-app/
├── src/           # Source code
│   └── deno.ts    # Deno Deploy entry point
├── api/           # API endpoint handlers
├── storage/       # Deno KV operations and types
├── utils/         # Health checking and router API utilities
└── dashboard/     # Static dashboard files
```

## API Endpoints

- `GET /health/apps` - List all apps and plugins
- `GET /health/cache` - Get cached health data
- `POST /health/update` - Update health status
- `GET /health/proxy/status?domain=X` - Check app health
- `GET /health/proxy/manifest?domain=X` - Check plugin manifest
- `GET /json` - Legacy API endpoint
- `GET /` - Health dashboard

## Development

```bash
# Install Deno
curl -fsSL https://deno.land/install.sh | sh

# Run locally
deno task dev

# Or with manual command
deno run --allow-net --allow-env --allow-read --allow-write --unstable-kv --watch src/deno.ts
```

## Deployment

This project is configured for automatic deployment to Deno Deploy using GitHub Actions.

### Automatic Deployment

The repository includes a GitHub Actions workflow (`.github/workflows/deno-deploy.yml`) that:

- Deploys automatically on push to any branch
- Uses different environments for `main` branch (production) vs other branches (development)
- Supports manual deployment via workflow dispatch
- Automatically deletes deployments when branches are deleted

### Setup Requirements

1. **Deno Deploy Token**: Add `DENO_DEPLOY_TOKEN` to your GitHub repository secrets
   - Get this token from your Deno Deploy dashboard
   - Go to Repository Settings → Secrets and variables → Actions
   - Add a new repository secret named `DENO_DEPLOY_TOKEN`

2. **Environment Configuration** (optional):
   - Create `main` and `development` environments in GitHub repository settings
   - Configure any environment-specific variables if needed

### Manual Deployment

You can also deploy manually to Deno Deploy:

1. Connect your GitHub repository to Deno Deploy
2. Set the entry point to `main.ts`
3. Configure environment variables if needed
4. Deploy

## Environment Variables

No environment variables are required - the app fetches apps list from the main ubq.fi router sitemap and plugin-map endpoints.

## KV Storage Structure

The app uses Deno KV with the following structure:

```
['health', 'cache'] -> CachedHealthData {
  apps: { [key: string]: AppHealth }
  plugins: { [key: string]: PluginHealth }
  lastGlobalUpdate: string
}
```

## Rate Limiting

- Health checks are rate limited to once every 5 minutes per app/plugin
- Updates to KV storage include rate limiting to prevent abuse
- Automatic fallback to localStorage when KV limits are exceeded

## Performance Optimizations

- Client-side health checking reduces server load
- Batch processing of health checks (5 at a time)
- Caching with appropriate TTLs
- Rate limiting prevents excessive resource usage
- Fallback storage prevents service disruption

## Monitoring

The dashboard provides real-time monitoring with:

- Overall system health percentage
- App and plugin status counts
- Last update timestamps
- Individual app/plugin details
- Error reporting
- Automatic refresh every 5 minutes
