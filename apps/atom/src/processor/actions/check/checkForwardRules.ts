import {
	CannotAnswerError,
	type ForwardReason,
} from "../../../lib/forward/cannotAnswerError.js";
import type { AnswerableCheck, CheckRequest } from "../../types/check.js";

const DEFAULT_REQUIRED_BALANCE = 1;

const FORWARD_RULES: {
	reason: ForwardReason;
	applies: (request: CheckRequest) => boolean;
}[] = [
	{
		reason: "no_api_version",
		applies: ({ apiVersion }) => apiVersion === null,
	},
	{
		reason: "product_check",
		applies: ({ params }) => !params.feature_id || Boolean(params.product_id),
	},
	{ reason: "send_event", applies: ({ params }) => params.send_event === true },
	{ reason: "lock", applies: ({ params }) => params.lock !== undefined },
	{
		reason: "with_preview",
		applies: ({ params }) => params.with_preview === true,
	},
	{
		reason: "customer_data",
		applies: ({ params }) =>
			params.customer_data !== undefined || params.entity_data !== undefined,
	},
	{ reason: "skip_cache", applies: ({ query }) => query.skip_cache === true },
];

export const checkForwardReason = ({
	request,
}: {
	request: CheckRequest;
}): ForwardReason | null =>
	FORWARD_RULES.find(({ applies }) => applies(request))?.reason ?? null;

export const checkRequestToAnswerableCheck = ({
	request,
}: {
	request: CheckRequest;
}): AnswerableCheck => {
	const reason = checkForwardReason({ request });
	if (reason) throw new CannotAnswerError({ reason });

	const { params, apiVersion } = request;
	if (!params.feature_id)
		throw new CannotAnswerError({ reason: "product_check" });
	if (!apiVersion) throw new CannotAnswerError({ reason: "no_api_version" });

	return {
		requestId: request.requestId,
		occurredAt: request.occurredAt,
		customerId: params.customer_id,
		entityId: params.entity_id ?? null,
		featureId: params.feature_id,
		requiredBalance:
			params.required_balance ??
			params.required_quantity ??
			DEFAULT_REQUIRED_BALANCE,
		properties: params.properties ?? null,
		query: request.query,
		apiVersion,
	};
};
