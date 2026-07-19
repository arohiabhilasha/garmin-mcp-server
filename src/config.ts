import "dotenv/config";
import path from "node:path";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing ${name}. Copy .env.example to .env and set it.`);
  }
  return value;
}

export type GarminConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  authorizeUrl: string;
  tokenUrl: string;
  apiBaseUrl: string;
  tokenFile: string;
};

export function loadConfig(): GarminConfig {
  return {
    clientId: required("GARMIN_CLIENT_ID"),
    clientSecret: required("GARMIN_CLIENT_SECRET"),
    redirectUri:
      process.env.GARMIN_REDIRECT_URI?.trim() ??
      "http://127.0.0.1:8787/callback",
    authorizeUrl:
      process.env.GARMIN_AUTHORIZE_URL?.trim() ??
      "https://connect.garmin.com/oauth2Confirm",
    tokenUrl:
      process.env.GARMIN_TOKEN_URL?.trim() ??
      "https://diauth.garmin.com/di-oauth2-service/oauth/token",
    apiBaseUrl:
      process.env.GARMIN_API_BASE_URL?.trim() ??
      "https://apis.garmin.com/wellness-api/rest",
    tokenFile: path.resolve(
      process.env.GARMIN_TOKEN_FILE?.trim() ?? ".garmin-tokens.json",
    ),
  };
}
