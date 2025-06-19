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
3. Run development server: `bun run main.ts`
4. Access dashboard at `http://localhost:8000/dashboard`

## Constraints
- Requires Deno runtime (v1.30+)
- KV storage requires Deno Deploy for persistence
- Dashboard must remain lightweight (no frameworks)

## Dependencies
- **External Services**: None (self-contained)
- **Third-party APIs**: Health check endpoints of Ubiquity services
- **Key Integrations**: Deno KV, Fetch API