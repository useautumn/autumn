import {
	ApiVersionClass,
	CheckParamsSchema,
	CheckQuerySchema,
	parseVersion,
} from "@autumn/shared";
import type { CheckRequest } from "../../processor/types/check.js";
import { CannotAnswerError } from "../forward/cannotAnswerError.js";

/** `x-api-version` as the API reads it: absent is null, unreadable is undefined. */
const versionsByHeader = new Map<string, ApiVersionClass | undefined>();

export const headerToApiVersion = ({
	header,
}: {
	header: string | undefined;
}): ApiVersionClass | null | undefined => {
	if (!header) return null;
	if (versionsByHeader.has(header)) return versionsByHeader.get(header);
	const version = parseVersion({ versionStr: header });
	const parsed = version ? new ApiVersionClass(version) : undefined;
	if (versionsByHeader.size < 64) versionsByHeader.set(header, parsed);
	return parsed;
};

/**
 * `POST /v1/balances.check` exactly as Autumn's API takes it, read with the API's own schemas.
 * A part that cannot be read is left to the API, which answers with its own error.
 */
export const checkCallToRequest = ({
	body,
	query,
	apiVersionHeader,
	idempotencyKey,
	requestId,
	occurredAt,
}: {
	body: unknown;
	query: Record<string, string>;
	apiVersionHeader: string | undefined;
	/** The caller's Idempotency-Key header. */
	idempotencyKey: string | undefined;
	requestId: string;
	occurredAt: number;
}): CheckRequest => {
	const params = CheckParamsSchema.safeParse(body);
	const parsedQuery = CheckQuerySchema.safeParse(query);
	const apiVersion = headerToApiVersion({ header: apiVersionHeader });
	if (!params.success || !parsedQuery.success || apiVersion === undefined)
		throw new CannotAnswerError({ reason: "unreadable_request" });

	return {
		requestId,
		occurredAt,
		// The API takes an empty key as none.
		idempotencyKey: idempotencyKey || null,
		params: params.data,
		query: parsedQuery.data,
		apiVersion,
	};
};
