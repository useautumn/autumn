import type * as z from "zod/v4";

/** A tool that calls a single Autumn endpoint with the parsed request. */
export type OperationToolConfig = {
	id: string;
	description: string;
	schema: z.ZodType;
	endpoint: string;
	/** Expansion the endpoint always needs, merged in after the request parses. */
	expand?: string[];
	/** Fields the tool always sends, merged in after the request parses, e.g.
	 * the `preview` flag that splits one endpoint into a preview and a write. */
	fixedFields?: Record<string, unknown>;
	destructive?: boolean;
	idempotent?: boolean;
};

export type BillingPreviewToolConfig = {
	id: string;
	description: string;
	schema: z.ZodType;
	previewEndpoint: string;
};

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
