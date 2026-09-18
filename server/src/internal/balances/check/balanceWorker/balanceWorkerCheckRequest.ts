import {
	type CheckCommand,
	orgToCommandOrg,
	parseCheckCommand,
} from "@autumn/balance-engine";
import type { CheckParams } from "@autumn/shared";
import { BalanceWorkerUnsupportedError } from "../../balanceWorker/balanceWorkerErrors.js";
import type { BalanceWorkerRequestContext } from "../../balanceWorker/balanceWorkerRequestContext.js";
import { featureToInternalFeatureId } from "../../balanceWorker/featureToInternalFeatureId.js";
import { requestContextToCommandBase } from "../../balanceWorker/requestContextToCommandBase.js";
import { validateBalanceWorkerRequest } from "../../balanceWorker/validateBalanceWorkerRequest.js";

export function checkParamsToCheckCommand({
	ctx,
	body,
}: {
	ctx: BalanceWorkerRequestContext;
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
			...requestContextToCommandBase({
				ctx,
				customerId: body.customer_id,
				entityId: body.entity_id ?? null,
			}),
			type: "check",
			org: orgToCommandOrg({ org: ctx.org }),
			featureId: body.feature_id,
			internalFeatureId: featureToInternalFeatureId({
				ctx,
				featureId: body.feature_id,
			}),
			requiredBalance: body.required_balance ?? body.required_quantity ?? 1,
			properties: body.properties ?? null,
		},
	});
}
