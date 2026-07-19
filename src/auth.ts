import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import open from "open";
import { loadConfig } from "./config.js";
import { saveTokens } from "./token-store.js";

function base64Url(value: Buffer): string {
  return value.toString("base64url");
}

async function authorize(): Promise<void> {
  const config = loadConfig();
  const callback = new URL(config.redirectUri);
  if (callback.protocol !== "http:" || !callback.port) {
    throw new Error(
      "GARMIN_REDIRECT_URI must be a local HTTP URL with a port, such as http://127.0.0.1:8787/callback.",
    );
  }

  const verifier = base64Url(randomBytes(48));
  const challenge = base64Url(
    createHash("sha256").update(verifier).digest(),
  );
  const state = base64Url(randomBytes(24));
  const authorizationUrl = new URL(config.authorizeUrl);
  authorizationUrl.search = new URLSearchParams({
    response_type: "code",
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    code_challenge: challenge,
    code_challenge_method: "S256",
    state,
  }).toString();

  const code = await new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => {
      server.close();
      reject(new Error("Garmin authorization timed out after five minutes."));
    }, 5 * 60_000);

    const server = createServer((request, response) => {
      const requestUrl = new URL(
        request.url ?? "/",
        `${callback.protocol}//${callback.host}`,
      );
      if (requestUrl.pathname !== callback.pathname) {
        response.writeHead(404).end("Not found");
        return;
      }

      const error = requestUrl.searchParams.get("error");
      const returnedState = requestUrl.searchParams.get("state");
      const authorizationCode = requestUrl.searchParams.get("code");

      if (error || returnedState !== state || !authorizationCode) {
        response
          .writeHead(400, { "Content-Type": "text/plain" })
          .end("Garmin authorization failed. Return to the terminal.");
        clearTimeout(timeout);
        server.close();
        reject(
          new Error(
            error ??
              (returnedState !== state
                ? "OAuth state did not match."
                : "Garmin did not return an authorization code."),
          ),
        );
        return;
      }

      response
        .writeHead(200, { "Content-Type": "text/plain" })
        .end("Garmin authorization complete. You may close this tab.");
      clearTimeout(timeout);
      server.close();
      resolve(authorizationCode);
    });

    server.on("error", reject);
    server.listen(Number(callback.port), callback.hostname, () => {
      console.log(`Opening Garmin authorization:\n${authorizationUrl}`);
      void open(authorizationUrl.toString());
    });
  });

  const response = await fetch(config.tokenUrl, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      code,
      code_verifier: verifier,
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Garmin token exchange failed (${response.status}): ${await response.text()}`,
    );
  }

  const tokenResponse = (await response.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    token_type?: string;
  };
  if (!tokenResponse.access_token) {
    throw new Error("Garmin token response did not include an access token.");
  }

  await saveTokens(config.tokenFile, tokenResponse);
  console.log(`Garmin tokens saved securely to ${config.tokenFile}`);
}

authorize().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
