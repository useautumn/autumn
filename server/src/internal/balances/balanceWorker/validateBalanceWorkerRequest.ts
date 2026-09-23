import type { CheckParams, TrackParams } from "@autumn/shared";
import { BalanceWorkerUnsupportedError } from "./balanceWorkerErrors.js";
import type { BalanceWorkerRequestContext } from "./balanceWorkerRequestContext.js";

export function validateBalanceWorkerRequest({
	ctx,
	body,
}: {
	ctx: BalanceWorkerRequestContext;
	body: CheckParams | TrackParams;
}): void {
	if (body.entity_data)
		throw new BalanceWorkerUnsupportedError({
			reason: "inline_customer_data_not_supported",
		});
}
