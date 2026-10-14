import { ApiVersion, FinalizeLockParamsV1Schema } from "@autumn/shared";
import type { FinalizeRequest } from "../../processor/types/finalize.js";
import { CannotAnswerError } from "../forward/cannotAnswerError.js";
import { headerToApiVersion } from "./checkContract.js";

/** `POST /v1/balances.finalize` exactly as Autumn's API takes it from 2.6, where it names the lock's customer. */
export const finalizeCallToRequest = ({
	body,
	apiVersionHeader,
	requestId,
	occurredAt,
}: {
	body: unknown;
	apiVersionHeader: string | undefined;
	requestId: string;
	occurredAt: number;
}): FinalizeRequest => {
	const apiVersion = headerToApiVersion({ header: apiVersionHeader });
	if (apiVersion === undefined)
		throw new CannotAnswerError({ reason: "unreadable_request" });
	// The API derives a version from the org's creation date, which Atom does not hold.
	if (apiVersion === null)
		throw new CannotAnswerError({ reason: "no_api_version" });
	// Before 2.6 a finalize does not name its customer, so only the API can find its lock.
	if (apiVersion.lt(ApiVersion.V2_6))
		throw new CannotAnswerError({ reason: "lock_version" });
	const params = FinalizeLockParamsV1Schema.safeParse(body);
	if (!params.success)
		throw new CannotAnswerError({ reason: "unreadable_request" });
	return { requestId, occurredAt, params: params.data, apiVersion };
};
