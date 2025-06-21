# System Patterns

This document describes the system architecture, key technical decisions, design patterns in use, and component relationships for health.ubq.fi.

## Architecture Overview
- **Modular Design**: Separated into API, Dashboard, Storage, and Utils modules
- **API Layer**: Handles health check requests and caching
- **Dashboard**: Static HTML/JS frontend for visualization
- **Storage**: Key-value storage using Deno KV
- **Utils**: Shared utility functions

## Design Patterns
1. **Proxy Pattern**: Used in `api/proxy.ts` to forward requests
2. **Singleton Pattern**: KV storage instance in `storage/kv.ts`
3. **Facade Pattern**: Simplified API in `api/apps.ts`

## Component Relationships
```mermaid
flowchart TD
    Dashboard --> API
    API --> Apps
    Apps --> Storage[KV Storage]
    Apps --> Legacy[Legacy API]
    Utils --> API
    Utils --> Dashboard