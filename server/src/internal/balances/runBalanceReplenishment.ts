import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { AutoTopUpPayload } from "@/queue/workflows.js";
import { autoTopup } from "./autoTopUp/autoTopup.js";
import { settleThresholdCharge } from "./thresholdBilling/settleThresholdCharge.js";

/**
 * Both paths replenish a balance, but a top-up grants credit the customer is
 * buying while a settlement bills overage they already used — so they differ on
 * spend limits, missing cards and webhooks, and stay separate below this point.
 */
export const runBalanceReplenishment = async ({
	ctx,
	payload,
}: {
	ctx: AutumnContext;
	payload: AutoTopUpPayload;
}) => {
	const { customerId, featureId } = payload;

	const { handled } = await settleThresholdCharge({
		ctx,
		customerId,
		featureId,
	});
	if (handled) return;

	await autoTopup({ ctx, payload });
};
