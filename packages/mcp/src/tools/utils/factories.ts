import { createTool } from "@mastra/core/tools";
import * as z from "zod/v4";
import { getAutumnAuth } from "../../server/auth/auth.js";
import { mcpAnnotations } from "./annotations.js";
import { callAutumn } from "./client.js";
import type { LocalPreviewToolConfig, OperationToolConfig } from "./types.js";

/** Reads the `request` payload out of a tool input without casting. */
const getRequest = (input: unknown): unknown =>
	input && typeof input === "object" && "request" in input
		? input.request
		: undefined;

const signalOf = (context: { mcp?: { extra?: { signal?: AbortSignal } } }) =>
	context?.mcp?.extra?.signal;

/** The request schemas do not declare `expand`, so a tool's fixed expansion is
 * merged after parsing rather than offered to the caller as an input. */
const withExpand = ({
	expand,
	request,
}: {
	expand?: string[];
	request: unknown;
}): unknown =>
	expand?.length && request && typeof request === "object"
		? { ...request, expand }
		: request;

/** Builds a `{ id: tool }` record from a list of configs. */
export const toTools = <Config extends { id: string }>(
	configs: Config[],
	create: (config: Config) => ReturnType<typeof createTool>,
) => Object.fromEntries(configs.map((config) => [config.id, create(config)]));

/** Calls an Autumn endpoint directly with the parsed request. */
export const operationTool = ({
	id,
	description,
	schema,
	endpoint,
	expand,
	destructive = false,
	idempotent = false,
}: OperationToolConfig) =>
	createTool({
		id,
		description,
		inputSchema: z.object({ request: schema }).strict(),
		mcp: { annotations: mcpAnnotations({ destructive, idempotent }) },
		execute: (input, context) =>
			callAutumn({
				auth: getAutumnAuth(context),
				endpoint,
				request: withExpand({
					expand,
					request: schema.parse(getRequest(input)),
				}),
				retryable: !destructive || idempotent,
				signal: signalOf(context),
			}),
	});

/** Raw variant of a local preview: just returns the computed preview. */
export const rawLocalPreviewTool = ({
	id,
	description,
	schema,
	preview,
}: LocalPreviewToolConfig) =>
	createTool({
		id,
		description,
		inputSchema: z.object({ request: schema }).strict(),
		mcp: { annotations: mcpAnnotations() },
		execute: async (input) => preview(schema.parse(getRequest(input))),
	});
