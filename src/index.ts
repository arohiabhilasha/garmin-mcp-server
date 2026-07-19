#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { loadConfig } from "./config.js";
import {
  dataEndpoints,
  GarminClient,
  type GarminDataType,
} from "./garmin-client.js";

const DAY_MS = 24 * 60 * 60 * 1_000;

function asToolResult(value: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(value, null, 2),
      },
    ],
  };
}

function asToolError(error: unknown) {
  return {
    isError: true,
    content: [
      {
        type: "text" as const,
        text: error instanceof Error ? error.message : String(error),
      },
    ],
  };
}

function uploadWindow(from?: string, to?: string): { from: Date; to: Date } {
  const end = to ? new Date(to) : new Date();
  const start = from ? new Date(from) : new Date(end.getTime() - 7 * DAY_MS);
  return { from: start, to: end };
}

async function main(): Promise<void> {
  const client = new GarminClient(loadConfig());
  const server = new McpServer({
    name: "garmin-mcp-server",
    version: "0.1.0",
  });

  server.registerTool(
    "garmin_connection_status",
    {
      title: "Garmin connection status",
      description:
        "Check the authorized Garmin user and the data permissions granted to this MCP server.",
      inputSchema: {},
      annotations: {
        readOnlyHint: true,
        openWorldHint: true,
      },
    },
    async () => {
      try {
        const [user, permissions] = await Promise.all([
          client.getUser(),
          client.getPermissions(),
        ]);
        return asToolResult({ user, permissions });
      } catch (error) {
        return asToolError(error);
      }
    },
  );

  server.registerTool(
    "garmin_get_data",
    {
      title: "Get Garmin data",
      description:
        "Fetch Garmin summaries uploaded during a recent time window. Garmin's source API retains data for seven days and limits each query to a 24-hour upload window; this tool automatically splits the requested range.",
      inputSchema: {
        dataType: z.enum(
          Object.keys(dataEndpoints) as [
            GarminDataType,
            ...GarminDataType[],
          ],
        ),
        from: z
          .string()
          .datetime({ offset: true })
          .optional()
          .describe(
            "Start of upload window as ISO 8601. Defaults to seven days before 'to'.",
          ),
        to: z
          .string()
          .datetime({ offset: true })
          .optional()
          .describe("End of upload window as ISO 8601. Defaults to now."),
      },
      annotations: {
        readOnlyHint: true,
        openWorldHint: true,
      },
    },
    async ({ dataType, from, to }) => {
      try {
        const window = uploadWindow(from, to);
        const data = await client.getUploadedData(
          dataType as GarminDataType,
          window.from,
          window.to,
        );
        return asToolResult({
          dataType,
          uploadWindow: {
            from: window.from.toISOString(),
            to: window.to.toISOString(),
          },
          count: data.length,
          data,
        });
      } catch (error) {
        return asToolError(error);
      }
    },
  );

  server.registerTool(
    "garmin_get_training_context",
    {
      title: "Get running training context",
      description:
        "Fetch recent activities, daily health, sleep, HRV, stress, and fitness metrics together so Claude can assess running load and recovery. Missing categories usually mean that the Garmin project lacks that permission or the device did not produce the metric.",
      inputSchema: {
        days: z
          .number()
          .int()
          .min(1)
          .max(7)
          .default(7)
          .describe("Number of recent upload days to inspect."),
      },
      annotations: {
        readOnlyHint: true,
        openWorldHint: true,
      },
    },
    async ({ days }) => {
      const to = new Date();
      const from = new Date(to.getTime() - days * DAY_MS);
      const types = [
        "activities",
        "dailies",
        "sleeps",
        "hrv",
        "stress",
        "userMetrics",
      ] satisfies GarminDataType[];

      const entries = await Promise.all(
        types.map(async (type) => {
          try {
            return [type, await client.getUploadedData(type, from, to)];
          } catch (error) {
            return [
              type,
              {
                unavailable:
                  error instanceof Error ? error.message : String(error),
              },
            ];
          }
        }),
      );

      return asToolResult({
        note: "The window describes upload time, not necessarily the date each activity occurred.",
        uploadWindow: {
          from: from.toISOString(),
          to: to.toISOString(),
        },
        ...Object.fromEntries(entries),
      });
    },
  );

  await server.connect(new StdioServerTransport());
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
