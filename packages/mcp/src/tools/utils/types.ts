import type * as z from "zod/v4";

/** A tool that calls a single Autumn endpoint with the parsed request. */
export type OperationToolConfig = {
	id: string;
	description: string;
	schema: z.ZodType;
	endpoint: string;
	destructive?: boolean;
	idempotent?: boolean;
};

/** A preview tool that calls the write's preview endpoint. */
export type BillingPreviewToolConfig = {
	id: string;
	description: string;
	schema: z.ZodType;
	previewEndpoint: string;
};

/** A preview tool computed locally (no Autumn call). */
export type LocalPreviewToolConfig = {
	id: string;
	description: string;
	schema: z.ZodType;
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
