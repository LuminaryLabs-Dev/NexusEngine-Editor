#!/usr/bin/env node
import { pathToFileURL } from "node:url";
import { createEngine } from "nexusengine";
import {
  createMcpRegistryKit,
  defineMcpProvider
} from "nexusengine/domains/mcp";
import { connectMcpStdio } from "../src/adapters/node-mcp-sdk-adapter.js";

export function createMcpGameRuntime() {
  const state = {
    schemaVersion: "nexusengine.example-game-state.v1",
    phase: "ready",
    frame: 0,
    score: 0
  };

  const provider = defineMcpProvider({
    id: "nexusengine-example-game",
    version: "1.0.0",
    tools: [
      {
        name: "game_status",
        title: "Read Game Status",
        description: "Read the current phase, frame, and score.",
        inputSchema: {
          type: "object",
          properties: {},
          additionalProperties: false
        },
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false
        },
        handler: () => ({ ...state })
      },
      {
        name: "game_step",
        title: "Advance Game",
        description: "Advance the opted-in game runtime by one bounded action.",
        approval: "required",
        inputSchema: {
          type: "object",
          properties: {
            points: {
              type: "integer",
              minimum: 0,
              maximum: 100
            }
          },
          required: ["points"],
          additionalProperties: false
        },
        annotations: {
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: false
        },
        handler: ({ points }) => {
          state.phase = "running";
          state.frame += 1;
          state.score += points;
          return { ...state };
        }
      }
    ],
    resources: [{
      name: "game-state",
      uri: "nexus-game://state",
      title: "NexusEngine Example Game State",
      description: "Current state for this opted-in game process.",
      read: () => ({ ...state })
    }],
    prompts: [{
      name: "play_example_game",
      title: "Play Example Game",
      description: "Inspect state before choosing one bounded game action.",
      arguments: [],
      render: () => ({
        messages: [{
          role: "user",
          content: {
            type: "text",
            text: "Read nexus-game://state, then call game_step only when a bounded score change is appropriate."
          }
        }]
      })
    }]
  });

  const engine = createEngine({
    domainKits: false,
    kits: [createMcpRegistryKit({ providers: [provider] })]
  });

  return Object.freeze({
    engine,
    getState: () => ({ ...state })
  });
}

export async function runMcpGameStdio() {
  const runtime = createMcpGameRuntime();
  return connectMcpStdio({
    mcp: runtime.engine.n.mcp,
    name: "nexusengine-example-game",
    version: "1.0.0",
    instructions: "Read nexus-game://state before acting. game_step requires NEXUS_GAME_MCP_ALLOW_ACTIONS=1.",
    authorize: ({ tool }) => tool.name !== "game_step" || process.env.NEXUS_GAME_MCP_ALLOW_ACTIONS === "1"
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await runMcpGameStdio();
}
