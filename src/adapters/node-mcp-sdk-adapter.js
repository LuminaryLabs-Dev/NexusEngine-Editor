import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  ListResourcesRequestSchema,
  ListResourceTemplatesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema
} from "@modelcontextprotocol/sdk/types.js";

function requireMcpApi(value) {
  for (const method of [
    "listTools",
    "callTool",
    "listResources",
    "listResourceTemplates",
    "readResource",
    "listPrompts",
    "getPrompt"
  ]) {
    if (typeof value?.[method] !== "function") {
      throw new TypeError("MCP SDK adapter requires mcp." + method + "().");
    }
  }
  return value;
}

function compact(value) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry != null));
}

export function createMcpSdkServer(options = {}) {
  const mcp = requireMcpApi(options.mcp);
  const server = new Server({
    name: String(options.name ?? "nexusengine-editor-mcp"),
    version: String(options.version ?? "0.1.0")
  }, {
    capabilities: { tools: {}, resources: {}, prompts: {} },
    instructions: options.instructions == null ? undefined : String(options.instructions)
  });

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: mcp.listTools().map((tool) => compact({
      name: tool.name,
      title: tool.title,
      description: tool.description,
      inputSchema: tool.inputSchema,
      outputSchema: tool.outputSchema,
      annotations: tool.annotations
    }))
  }));
  server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
    try {
      return await mcp.callTool(request.params.name, request.params.arguments ?? {}, {
        authorize: options.authorize,
        signal: extra?.signal,
        metadata: request.params._meta ?? null
      });
    } catch (error) {
      return {
        content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }],
        isError: true
      };
    }
  });
  server.setRequestHandler(ListResourcesRequestSchema, async () => ({
    resources: mcp.listResources().map((resource) => compact(resource))
  }));
  server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => ({
    resourceTemplates: mcp.listResourceTemplates().map((template) => compact(template))
  }));
  server.setRequestHandler(ReadResourceRequestSchema, async (request, extra) => (
    mcp.readResource(request.params.uri, {
      signal: extra?.signal,
      metadata: request.params._meta ?? null
    })
  ));
  server.setRequestHandler(ListPromptsRequestSchema, async () => ({
    prompts: mcp.listPrompts().map((prompt) => compact({
      name: prompt.name,
      title: prompt.title,
      description: prompt.description,
      arguments: prompt.arguments.map((argument) => compact(argument))
    }))
  }));
  server.setRequestHandler(GetPromptRequestSchema, async (request, extra) => (
    mcp.getPrompt(request.params.name, request.params.arguments ?? {}, {
      signal: extra?.signal,
      metadata: request.params._meta ?? null
    })
  ));
  return server;
}

export async function connectMcpStdio(options = {}) {
  const server = createMcpSdkServer(options);
  const transport = options.transport ?? new StdioServerTransport();
  await server.connect(transport);
  return Object.freeze({
    server,
    transport,
    async close() {
      await server.close();
    }
  });
}
