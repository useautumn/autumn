import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import {
	CallToolRequestSchema,
	type CallToolResult,
	ListToolsRequestSchema,
	type ServerNotification,
	type ServerRequest,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod/v4";
import { runTool } from "./toolResult.ts";

export type ToolExtra = RequestHandlerExtra<ServerRequest, ServerNotification>;

type TwdTool = {
	name: string;
	description: string;
	inputSchema: { type: "object"; [key: string]: unknown };
	call: (rawArgs: unknown, extra: ToolExtra) => Promise<CallToolResult>;
};

/** Tool schemas use twd's own zod (the SDK resolves a different major), so we serve tools on the low-level Server. */
export const defineTool = <S extends z.ZodObject>({
	name,
	description,
	input,
	run,
}: {
	name: string;
	description: string;
	input: S;
	run: (args: z.infer<S>, extra: ToolExtra) => Promise<CallToolResult>;
}): TwdTool => {
	const { $schema: _schema, ...jsonSchema } = z.toJSONSchema(input);
	return {
		name,
		description,
		inputSchema: { ...jsonSchema, type: "object" },
		call: (rawArgs, extra) =>
			runTool({ input, rawArgs, run: (args) => run(args, extra) }),
	};
};

export const serveTools = (tools: TwdTool[]) => {
	const server = new Server(
		{ name: "twd", version: "1.0.0" },
		{ capabilities: { tools: {} } },
	);
	const byName = new Map(tools.map((t) => [t.name, t]));

	server.setRequestHandler(ListToolsRequestSchema, () => ({
		tools: tools.map(({ name, description, inputSchema }) => ({
			name,
			description,
			inputSchema,
		})),
	}));
	server.setRequestHandler(CallToolRequestSchema, (request, extra) => {
		const tool = byName.get(request.params.name);
		if (tool) return tool.call(request.params.arguments, extra);
		return {
			isError: true,
			content: [
				{
					type: "text",
					text: `Unknown tool ${request.params.name}. Available: ${tools.map((t) => t.name).join(", ")}.`,
				},
			],
		};
	});
	return server;
};
