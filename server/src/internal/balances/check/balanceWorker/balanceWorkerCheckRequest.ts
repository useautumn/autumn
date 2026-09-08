import { type CheckCommand, parseCheckCommand } from "@autumn/balance-engine";
import type { CheckParams } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { BalanceWorkerUnsupportedError } from "../../balanceWorker/balanceWorkerErrors.js";
import { validateBalanceWorkerRequest } from "../../balanceWorker/validateBalanceWorkerRequest.js";

export function checkParamsToCheckCommand({
	ctx,
	body,
}: {
	ctx: AutumnContext;
	body: CheckParams;
}): CheckCommand {
	validateBalanceWorkerRequest({ ctx, body });
	if (!body.feature_id || body.product_id)
		throw new BalanceWorkerUnsupportedError({
			reason: "product_check_not_supported",
		});
	if (body.send_event)
		throw new BalanceWorkerUnsupportedError({
			reason: "check_and_track_not_supported",
		});
	if (body.with_preview)
		throw new BalanceWorkerUnsupportedError({
			reason: "preview_not_supported",
		});
	return parseCheckCommand({
		input: {
			schemaVersion: 1,
			type: "check",
			requestId: ctx.id,
			identity: {
				orgId: ctx.org.id,
				env: ctx.env,
				customerId: body.customer_id,
			},
			entityId: null,
			featureId: body.feature_id,
			requiredBalance: body.required_balance ?? body.required_quantity ?? 1,
			properties: body.properties ?? null,
			occurredAt: ctx.timestamp,
		},
	});
}
