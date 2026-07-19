import type { GarminConfig } from "./config.js";
import { getValidTokens } from "./token-store.js";

export const dataEndpoints = {
  activities: "activities",
  activityDetails: "activityDetails",
  dailies: "dailies",
  sleeps: "sleeps",
  epochs: "epochs",
  stress: "stressDetails",
  userMetrics: "userMetrics",
  bodyComposition: "bodyComps",
  respiration: "respiration",
  pulseOx: "pulseOx",
  hrv: "hrv",
} as const;

export type GarminDataType = keyof typeof dataEndpoints;

const DAY_MS = 24 * 60 * 60 * 1_000;
const MAX_LOOKBACK_MS = 7 * DAY_MS;

export class GarminClient {
  constructor(private readonly config: GarminConfig) {}

  async getUser(): Promise<unknown> {
    return this.request("user/id");
  }

  async getPermissions(): Promise<unknown> {
    return this.request("user/permissions");
  }

  async getUploadedData(
    type: GarminDataType,
    from: Date,
    to: Date,
  ): Promise<unknown[]> {
    const now = Date.now();
    if (
      !Number.isFinite(from.getTime()) ||
      !Number.isFinite(to.getTime()) ||
      from >= to
    ) {
      throw new Error('"from" must be before "to" and both must be valid dates.');
    }
    if (to.getTime() - from.getTime() > MAX_LOOKBACK_MS) {
      throw new Error("A single request can cover at most seven days.");
    }
    if (from.getTime() < now - MAX_LOOKBACK_MS - 60_000) {
      throw new Error(
        "Garmin only retains uploaded summaries for seven days. Use webhooks and your own database for older history.",
      );
    }

    const results: unknown[] = [];
    let cursor = from.getTime();
    while (cursor < to.getTime()) {
      const end = Math.min(cursor + DAY_MS, to.getTime());
      const value = await this.request(dataEndpoints[type], {
        uploadStartTimeInSeconds: Math.floor(cursor / 1_000).toString(),
        uploadEndTimeInSeconds: Math.floor(end / 1_000).toString(),
      });
      if (Array.isArray(value)) {
        results.push(...value);
      } else if (value !== null && value !== undefined) {
        results.push(value);
      }
      cursor = end;
    }
    return results;
  }

  private async request(
    endpoint: string,
    query?: Record<string, string>,
  ): Promise<unknown> {
    const tokens = await getValidTokens(this.config);
    const url = new URL(
      `${this.config.apiBaseUrl.replace(/\/$/, "")}/${endpoint}`,
    );
    for (const [name, value] of Object.entries(query ?? {})) {
      url.searchParams.set(name, value);
    }

    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        Authorization: `${tokens.tokenType} ${tokens.accessToken}`,
      },
    });
    const body = await response.text();
    if (!response.ok) {
      throw new Error(
        `Garmin API request to ${endpoint} failed (${response.status}): ${body}`,
      );
    }
    return body ? (JSON.parse(body) as unknown) : null;
  }
}
