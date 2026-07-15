import type * as z from "zod/v4";

/**
 * Tool names that mutate billing state. These are the only tools that can be
 * staged as a pending action and later applied via `confirmBillingAction`.
 * Declared as a tuple so the union type and runtime guard stay in sync.
 */
export const CONFIRMED_WRITE_TOOL_NAMES = [
	"attach",
	"updateSubscription",
	"createPlan",
	"createSchedule",
	"createBalance",
] as const;

export type ConfirmedWriteToolName =
	(typeof CONFIRMED_WRITE_TOOL_NAMES)[number];

export const isConfirmedWriteToolName = (
	id: string,
): id is ConfirmedWriteToolName =>
	CONFIRMED_WRITE_TOOL_NAMES.some((name) => name === id);

/** A tool that calls a single Autumn endpoint with the parsed request. */
export type OperationToolConfig = {
	id: string;
	description: string;
	schema: z.ZodType;
	endpoint: string;
	expand?: string[];
	destructive?: boolean;
	idempotent?: boolean;
};

/** A preview tool whose result is staged as a pending billing write. */
export type BillingPreviewToolConfig = {
	id: string;
	description: string;
	schema: z.ZodType;
	previewEndpoint: string;
	expand?: string[];
	writeToolName: ConfirmedWriteToolName;
};

/** A preview tool computed locally (no Autumn call) before a billing write. */
export type LocalPreviewToolConfig = {
	id: string;
	description: string;
	schema: z.ZodType;
	writeToolName: ConfirmedWriteToolName;
	preview: (request: unknown) => unknown;
};

/**
 * One business domain's tool declarations, grouped by behaviour. The top-level
 * `index.ts` composes these into the raw (MCP) and agent toolsets.
 */
export type ToolDomain = {
	operations?: OperationToolConfig[];
	billingPreviews?: BillingPreviewToolConfig[];
	localPreviews?: LocalPreviewToolConfig[];
	confirmedWrites?: OperationToolConfig[];
};
