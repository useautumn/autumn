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
	let reason: string | undefined;

	if (body.lock) reason = "lock_not_supported";
	else if (body.customer_data || body.entity_data)
		reason = "inline_customer_data_not_supported";
	if (reason) throw new BalanceWorkerUnsupportedError({ reason });
}
