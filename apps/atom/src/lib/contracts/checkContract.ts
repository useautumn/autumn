import {
	ApiVersionClass,
	CheckParamsSchema,
	CheckQuerySchema,
	parseVersion,
} from "@autumn/shared";
import type { CheckRequest } from "../../processor/types/check.js";
import { CannotAnswerError } from "../forward/cannotAnswerError.js";

/** `x-api-version` as the API reads it: absent is null, unreadable is undefined. */
const headerToApiVersion = ({
	header,
}: {
	header: string | undefined;
}): ApiVersionClass | null | undefined => {
	if (!header) return null;
	const version = parseVersion({ versionStr: header });
	return version ? new ApiVersionClass(version) : undefined;
};

/**
 * `POST /v1/balances.check` exactly as Autumn's API takes it, read with the API's own schemas.
 * A part that cannot be read is left to the API, which answers with its own error.
 */
export const checkCallToRequest = ({
	body,
	query,
	apiVersionHeader,
	requestId,
	occurredAt,
}: {
	body: unknown;
	query: Record<string, string>;
	apiVersionHeader: string | undefined;
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
		params: params.data,
		query: parsedQuery.data,
		apiVersion,
	};
};
