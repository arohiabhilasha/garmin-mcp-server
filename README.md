# Garmin MCP server

A local, read-only MCP server that lets Claude Desktop retrieve data from an
approved Garmin Connect Developer Program project. Claude can use the returned
activities and recovery metrics to create or adjust a running plan.

## What it exposes

- `garmin_connection_status` — authorized user and granted permissions
- `garmin_get_data` — one Garmin summary category for a recent upload window
- `garmin_get_training_context` — activities, daily health, sleep, HRV, stress,
  and fitness metrics in one call

The server does not generate a plan itself. It gives Claude the source data;
Claude performs the analysis and plan customization.

## Prerequisites

- Node.js 20 or newer
- An approved Garmin Connect Developer Program application
- OAuth 2.0 + PKCE enabled for that application
- Ping/Pull access and the summary feeds you want enabled in Garmin's portal

Garmin's Health API is a partner API, not a public personal-account API. A
normal Garmin username and password are not API credentials.

## Install and authorize

```bash
npm install
cp .env.example .env
```

Put the client ID and client secret from Garmin in `.env`. Register this exact
redirect URI in Garmin's developer portal:

```text
http://127.0.0.1:8787/callback
```

Then authorize your Garmin account and build the server:

```bash
npm run auth
npm run build
```

Authorization writes `.garmin-tokens.json` with owner-only file permissions.
Both that file and `.env` are excluded from Git.

Garmin may assign environment-specific URLs to an evaluation project. If its
portal documentation gives you different authorization, token, or API URLs,
set the corresponding overrides in `.env`.

## Add it to Claude Desktop

Open Claude Desktop → Settings → Developer → Edit Config, then add:

```json
{
  "mcpServers": {
    "garmin": {
      "command": "node",
      "args": [
        "/Users/abhilashaarohi/Projects/garmin-mcp-server/dist/index.js"
      ],
      "cwd": "/Users/abhilashaarohi/Projects/garmin-mcp-server"
    }
  }
}
```

If your config already contains other servers, add only the `garmin` entry
inside its existing `mcpServers` object. Fully restart Claude Desktop, then ask:

> Check my Garmin connection and summarize my recent running and recovery
> context. Before creating a plan, ask for my race distance, race date, weekly
> availability, current weekly mileage, injury history, and preferred long-run
> day. Use conservative progression and explain any recovery concerns.

## Test without Claude

```bash
npm run inspect
```

The MCP Inspector lets you call each tool and view its raw result.

## Garmin data limitations

Garmin's Health API query windows are based on **upload time**, not activity
date. Each API request can cover at most 24 hours, so this server splits larger
requests automatically.

Garmin retains uploaded summaries for only seven days. This local version can
retrieve recent uploads but cannot provide reliable long-term history unless
it is run regularly. A production version should:

1. expose a public HTTPS webhook for Garmin Ping or Push notifications;
2. fetch each notification immediately;
3. upsert updates into a database by Garmin summary ID and start time; and
4. have MCP tools query that database.

Garmin's developer portal can initiate backfills for older history. Backfill
results are asynchronous and must also be captured through Ping or Push.

## Privacy and safety

- Keep `.env` and `.garmin-tokens.json` private.
- The tools are read-only and do not upload workouts to Garmin.
- Treat an AI-generated running plan as general training guidance, not medical
  advice. Pain, illness, abnormal cardiovascular symptoms, or injury requires
  appropriate professional advice.
