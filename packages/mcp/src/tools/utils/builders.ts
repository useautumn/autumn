import type * as z from "zod/v4";
import type {
	BillingPreviewToolConfig,
	ConfirmedWriteToolName,
	LocalPreviewToolConfig,
	OperationToolConfig,
} from "./types.js";

/**
 * Domain-scoped config composers bound to a domain's `endpoints` and `schemas`
 * maps. A tool's `id` keys into both maps, so each tool declares its id,
 * description, and semantics once — the schema and endpoint are looked up rather
 * than repeated. The `id` is type-checked against the relevant map keys.
 */
export const createDomainTools = <
	E extends Record<string, string>,
	S extends Record<string, z.ZodType>,
>({
	endpoints,
	schemas,
}: {
	endpoints: E;
	schemas: S;
}) => {
	type EndpointId = Extract<keyof E & keyof S, string>;
	type SchemaId = Extract<keyof S, string>;

	/** A tool that calls its endpoint directly with the parsed request. */
	const operation = ({
		id,
		description,
		destructive = false,
		idempotent = false,
	}: {
		id: EndpointId;
		description: string;
		destructive?: boolean;
		idempotent?: boolean;
	}): OperationToolConfig => ({
		id,
		description,
		schema: schemas[id],
		endpoint: endpoints[id],
		destructive,
		idempotent,
	});

	/** A preview tool that stages a pending billing write via its preview endpoint. */
	const billingPreview = ({
		id,
		description,
		expand,
		writeToolName,
	}: {
		id: EndpointId;
		description: string;
		expand?: string[];
		writeToolName: ConfirmedWriteToolName;
	}): BillingPreviewToolConfig => ({
		id,
		description,
		schema: schemas[id],
		previewEndpoint: endpoints[id],
		expand,
		writeToolName,
	});

	/** A destructive write applied only after the user confirms a preview. */
	const confirmedWrite = ({
		id,
		description,
	}: {
		id: EndpointId;
		description: string;
	}): OperationToolConfig => ({
		id,
		description,
		schema: schemas[id],
		endpoint: endpoints[id],
		destructive: true,
	});

	/** A preview computed locally (no Autumn call) before a billing write. */
	const localPreview = ({
		id,
		description,
		writeToolName,
		preview,
	}: {
		id: SchemaId;
		description: string;
		writeToolName: ConfirmedWriteToolName;
		preview: (request: unknown) => unknown;
	}): LocalPreviewToolConfig => ({
		id,
		description,
		schema: schemas[id],
		writeToolName,
		preview,
	});

	return { operation, billingPreview, confirmedWrite, localPreview };
};
