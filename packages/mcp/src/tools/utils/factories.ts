import { createTool } from "@mastra/core/tools";
import * as z from "zod/v4";
import { getAutumnAuth } from "../../server/auth/auth.js";
import { mcpAnnotations } from "./annotations.js";
import { callAutumn } from "./client.js";
import type { LocalPreviewToolConfig, OperationToolConfig } from "./types.js";

const getRequest = (input: unknown): unknown =>
	input && typeof input === "object" && "request" in input
		? input.request
		: undefined;

const signalOf = (context: { mcp?: { extra?: { signal?: AbortSignal } } }) =>
	context?.mcp?.extra?.signal;

const withFixedFields = ({
	expand,
	fixedFields,
	request,
}: {
	expand?: string[];
	fixedFields?: Record<string, unknown>;
	request: unknown;
}): unknown => {
	if (!request || typeof request !== "object") return request;
	if (!expand?.length && !fixedFields) return request;
	return {
		...request,
		...fixedFields,
		...(expand?.length ? { expand } : {}),
	};
};

export const toTools = <Config extends { id: string }>(
	configs: Config[],
	create: (config: Config) => ReturnType<typeof createTool>,
) => Object.fromEntries(configs.map((config) => [config.id, create(config)]));

export const operationTool = ({
	id,
	description,
	schema,
	endpoint,
	expand,
	fixedFields,
	transformResult,
	destructive = false,
	idempotent = false,
}: OperationToolConfig) =>
	createTool({
		id,
		description,
		inputSchema: z.object({ request: schema }).strict(),
		mcp: { annotations: mcpAnnotations({ destructive, idempotent }) },
		execute: async (input, context) => {
			const request = withFixedFields({
				expand,
				fixedFields,
				request: schema.parse(getRequest(input)),
			});
			const result = await callAutumn({
				auth: getAutumnAuth(context),
				endpoint,
				request,
				retryable: !destructive || idempotent,
				signal: signalOf(context),
			});
			return transformResult ? transformResult({ request, result }) : result;
		},
	});

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
