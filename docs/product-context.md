# Product Context

This document explains why the health.ubq.fi project exists, the problems it solves, and the intended user experience.

## Purpose
- Provide centralized health monitoring for Ubiquity apps
- Solve the problem of scattered health check endpoints across apps
- Target audience: Ubiquity developers and system administrators

## User Experience Goals
1. **API Consumers**: Simple, standardized health check endpoints
   - `/health` endpoint for current status
   - `/health/legacy` for backward compatibility
2. **Dashboard Users**: Real-time visualization of app health
   - Color-coded status indicators (green/red)
   - Last updated timestamp
   - App response times

## Value Proposition
- Unified health monitoring interface for all Ubiquity apps
- Reduced complexity for app consumers
- Improved system reliability through immediate visibility