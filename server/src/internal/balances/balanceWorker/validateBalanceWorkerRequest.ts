import type { CheckParams, TrackParams } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { BalanceWorkerUnsupportedError } from "./balanceWorkerErrors.js";

export function validateBalanceWorkerRequest({
	ctx,
	body,
}: {
	ctx: AutumnContext;
	body: CheckParams | TrackParams;
}): void {
	let reason: string | undefined;
	if (ctx.expand?.length) reason = "expand_not_supported";
	else if (body.entity_id) reason = "entity_not_supported";
	else if (body.properties && Object.keys(body.properties).length)
		reason = "properties_not_supported";
	else if (body.lock) reason = "lock_not_supported";
	else if (body.customer_data || body.entity_data)
		reason = "inline_customer_data_not_supported";
	if (reason) throw new BalanceWorkerUnsupportedError({ reason });
}
