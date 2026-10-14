import type { AutoTopupJobPayload } from "@autumn/auto-topup";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { autoTopup } from "./autoTopUp/autoTopup.js";
import { settleThresholdCharge } from "./thresholdBilling/settleThresholdCharge.js";

export const runBalanceReplenishment = async ({
	ctx,
	payload,
}: {
	ctx: AutumnContext;
	payload: AutoTopupJobPayload;
}) => {
	const { customerId, featureId } = payload;

	const { settled } = await settleThresholdCharge({
		ctx,
		customerId,
		featureId,
	});

	if (settled) return;

	await autoTopup({ ctx, payload });
};
