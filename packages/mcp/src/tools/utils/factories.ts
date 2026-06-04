import { createTool } from "@mastra/core/tools";
import * as z from "zod/v4";
import { createPendingAction } from "../../agent/pending-actions.js";
import { getAutumnAuth } from "../../server/auth/auth.js";
import { mcpAnnotations } from "./annotations.js";
import { callAutumn } from "./client.js";
import { logTool } from "./debug.js";
import {
	type BillingPreviewToolConfig,
	isConfirmedWriteToolName,
	type LocalPreviewToolConfig,
	type OperationToolConfig,
} from "./types.js";

const PENDING_MESSAGE =
	"Preview ready. Ask the user to explicitly apply or approve this exact change.";

/** Reads the `request` payload out of a tool input without casting. */
const getRequest = (input: unknown): unknown =>
	input && typeof input === "object" && "request" in input
		? input.request
		: undefined;

const signalOf = (context: { mcp?: { extra?: { signal?: AbortSignal } } }) =>
	context?.mcp?.extra?.signal;

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
				request: schema.parse(getRequest(input)),
				signal: signalOf(context),
			}),
	});

/** Agent variant: previews via Autumn, then stages a pending billing write. */
export const agentBillingPreviewTool = ({
	id,
	description,
	schema,
	previewEndpoint,
	writeToolName,
}: BillingPreviewToolConfig) =>
	createTool({
		id,
		description: `${description} Store the exact pending billing action for later confirmation.`,
		inputSchema: z.object({ request: schema }).strict(),
		mcp: { annotations: mcpAnnotations() },
		execute: async (input, context) => {
			const parsedRequest = schema.parse(getRequest(input));
			const auth = getAutumnAuth(context);
			logTool("preview-start", { previewTool: id, writeToolName });
			const preview = await callAutumn({
				auth,
				endpoint: previewEndpoint,
				request: parsedRequest,
				signal: signalOf(context),
			});
			await createPendingAction({
				auth,
				toolName: writeToolName,
				request: parsedRequest,
				preview: JSON.stringify(preview),
			});
			logTool("preview-stored", { previewTool: id, writeToolName });
			return { preview, pending: true, message: PENDING_MESSAGE };
		},
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

/** Agent variant of a local preview: stages a pending billing write. */
export const agentLocalPreviewTool = ({
	id,
	description,
	schema,
	writeToolName,
	preview,
}: LocalPreviewToolConfig) =>
	createTool({
		id,
		description: `${description} Store the exact pending billing action for later confirmation.`,
		inputSchema: z.object({ request: schema }).strict(),
		mcp: { annotations: mcpAnnotations() },
		execute: async (input, context) => {
			const parsedRequest = schema.parse(getRequest(input));
			const previewResult = preview(parsedRequest);
			await createPendingAction({
				auth: getAutumnAuth(context),
				toolName: writeToolName,
				request: parsedRequest,
				preview: JSON.stringify(previewResult),
			});
			return {
				preview: previewResult,
				pending: true,
				message: PENDING_MESSAGE,
			};
		},
	});

/** Agent variant of a destructive operation: stages the request instead of applying it. */
export const agentPendingWriteTool = ({
	id,
	description,
	schema,
}: OperationToolConfig) =>
	createTool({
		id,
		description: `${description} This internal agent tool stores the exact request for later confirmation instead of applying it immediately.`,
		inputSchema: z.object({ request: schema }).strict(),
		mcp: { annotations: mcpAnnotations() },
		execute: async (input, context) => {
			if (!isConfirmedWriteToolName(id)) {
				throw new Error(`Cannot stage a pending write for tool: ${id}`);
			}
			const parsedRequest = schema.parse(getRequest(input));
			await createPendingAction({
				auth: getAutumnAuth(context),
				toolName: id,
				request: parsedRequest,
				preview: JSON.stringify(parsedRequest),
			});
			return {
				pending: true,
				request: parsedRequest,
				message:
					"Request ready. Ask the user to explicitly apply or approve this exact change.",
			};
		},
	});
