import type {
  AppsListResponse,
  CachedHealthData,
  UpdateHealthRequest,
} from "./types.ts";

export interface DiscoveryCacheStore {
  getDiscoveryCache(): Promise<AppsListResponse | null>;
  acquireDiscoveryRefresh(
    owner: string,
    now: number,
    expiresAt: number,
  ): Promise<boolean>;
  saveDiscoveryCache(
    data: AppsListResponse,
    owner: string,
    now: number,
  ): Promise<boolean>;
  releaseDiscoveryRefresh(owner: string): Promise<void>;
}

export interface HealthUpdateResult {
  success: boolean;
  storage: string;
  timestamp: string;
  error?: string;
}

export interface HealthStore {
  discovery?: DiscoveryCacheStore;
  getCachedHealthData(): Promise<CachedHealthData>;
  updateHealthData(request: UpdateHealthRequest): Promise<HealthUpdateResult>;
}
