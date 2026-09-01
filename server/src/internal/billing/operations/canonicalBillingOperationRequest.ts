import { AttachParamsV1Schema } from "@api/billing/attachV2/attachParamsV1";
import { CreateScheduleParamsV0Schema } from "@api/billing/createSchedule/createScheduleParamsV0";
import { UpdateSubscriptionV1ParamsSchema } from "@api/billing/updateSubscription/updateSubscriptionV1Params";
import {
	BillingOperationAction,
	type BillingOperationCanonicalRequest,
} from "@models/billingOperationModels/billingOperationTable";
import { hashJson } from "@/utils/hash/hashJson";

const OPERATION_REQUEST_HASH_VERSION = 1;

export type BillingOperationRequestHash = `v${number}:${string}`;

export const parseCanonicalBillingOperationRequest = ({
	action,
	request,
}: {
	action: BillingOperationAction;
	request: unknown;
}): BillingOperationCanonicalRequest => {
	switch (action) {
		case BillingOperationAction.Attach:
			return AttachParamsV1Schema.parse(request);
		case BillingOperationAction.CreateSchedule:
			return CreateScheduleParamsV0Schema.parse(request);
		case BillingOperationAction.UpdateSubscription:
			return UpdateSubscriptionV1ParamsSchema.parse(request);
		default:
			throw new Error(`Unsupported billing action: ${String(action)}`);
	}
};

export const hashCanonicalBillingOperationRequest = ({
	action,
	canonicalRequest,
}: {
	action: BillingOperationAction;
	canonicalRequest: BillingOperationCanonicalRequest;
}): BillingOperationRequestHash => {
	const fingerprint = {
		version: OPERATION_REQUEST_HASH_VERSION,
		action,
		request: canonicalRequest,
	};
	return `v${OPERATION_REQUEST_HASH_VERSION}:${hashJson({ value: fingerprint })}`;
};
