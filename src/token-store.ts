import { readFile, writeFile } from "node:fs/promises";
import type { GarminConfig } from "./config.js";

export type GarminTokens = {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  tokenType: string;
};

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
};

export async function loadTokens(file: string): Promise<GarminTokens> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as GarminTokens;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(
        `Garmin is not authorized. Run "npm run auth" to create ${file}.`,
      );
    }
    throw error;
  }
}

export async function saveTokens(
  file: string,
  response: TokenResponse,
  previousRefreshToken?: string,
): Promise<GarminTokens> {
  const tokens: GarminTokens = {
    accessToken: response.access_token,
    refreshToken: response.refresh_token ?? previousRefreshToken,
    expiresAt: response.expires_in
      ? Date.now() + response.expires_in * 1_000
      : undefined,
    tokenType: response.token_type ?? "Bearer",
  };

  await writeFile(file, `${JSON.stringify(tokens, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  return tokens;
}

export async function getValidTokens(
  config: GarminConfig,
): Promise<GarminTokens> {
  const tokens = await loadTokens(config.tokenFile);
  const expiresSoon =
    tokens.expiresAt !== undefined && tokens.expiresAt <= Date.now() + 60_000;

  if (!expiresSoon) {
    return tokens;
  }
  if (!tokens.refreshToken) {
    throw new Error('Garmin token expired. Run "npm run auth" again.');
  }

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: tokens.refreshToken,
    client_id: config.clientId,
    client_secret: config.clientSecret,
  });
  const response = await fetch(config.tokenUrl, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!response.ok) {
    throw new Error(
      `Garmin token refresh failed (${response.status}): ${await response.text()}`,
    );
  }

  return saveTokens(
    config.tokenFile,
    (await response.json()) as TokenResponse,
    tokens.refreshToken,
  );
}
