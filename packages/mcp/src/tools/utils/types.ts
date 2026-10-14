import type * as z from "zod/v4";

export type OperationToolConfig = {
	id: string;
	description: string;
	schema: z.ZodType;
	endpoint: string;
	expand?: string[];
	fixedFields?: Record<string, unknown>;
	transformResult?: (args: { request: unknown; result: unknown }) => unknown;
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

export type ToolDomain = {
	operations?: OperationToolConfig[];
	billingPreviews?: BillingPreviewToolConfig[];
	localPreviews?: LocalPreviewToolConfig[];
	confirmedWrites?: OperationToolConfig[];
};
