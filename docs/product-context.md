# Product Context

This document explains why the health.ubq.fi project exists, the problems it solves, and the intended user experience.

## Purpose
- Provide centralized health monitoring for Ubiquity services
- Solve the problem of scattered health check endpoints across services
- Target audience: Ubiquity developers and system administrators

## User Experience Goals
1. **API Consumers**: Simple, standardized health check endpoints
   - `/health` endpoint for current status
   - `/health/legacy` for backward compatibility
2. **Dashboard Users**: Real-time visualization of service health
   - Color-coded status indicators (green/red)
   - Last updated timestamp
   - Service response times

## Value Proposition
- Unified health monitoring interface for all Ubiquity services
- Reduced complexity for service consumers
- Improved system reliability through immediate visibility