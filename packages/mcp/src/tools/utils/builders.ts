import type * as z from "zod/v4";
import type {
	BillingPreviewToolConfig,
	LocalPreviewToolConfig,
	OperationToolConfig,
} from "./types.js";

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

	const billingPreview = ({
		id,
		description,
	}: {
		id: EndpointId;
		description: string;
	}): BillingPreviewToolConfig => ({
		id,
		description,
		schema: schemas[id],
		previewEndpoint: endpoints[id],
	});

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

	const localPreview = ({
		id,
		description,
		preview,
	}: {
		id: SchemaId;
		description: string;
		preview: (request: unknown) => unknown;
	}): LocalPreviewToolConfig => ({
		id,
		description,
		schema: schemas[id],
		preview,
	});

	return { operation, billingPreview, confirmedWrite, localPreview };
};
