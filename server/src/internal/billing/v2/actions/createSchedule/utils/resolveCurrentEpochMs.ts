import { getTestClockFrozenTimeMs } from "@/external/stripe/testClocks/utils/convertStripeTestClock";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { CusService } from "@/internal/customers/CusService";

/** Resolves "now" for schedule operations, respecting Stripe test clocks in sandbox. */
export const resolveCurrentEpochMs = async ({
	ctx,
	customerId,
}: {
	ctx: AutumnContext;
	customerId: string;
}): Promise<number> => {
	const customer = await CusService.get({
		db: ctx.db,
		idOrInternalId: customerId,
		orgId: ctx.org.id,
		env: ctx.env,
	});
	const testClockMs = await getTestClockFrozenTimeMs({
		ctx,
		stripeCustomerId: customer?.processor?.id,
	});
	return testClockMs ?? Date.now();
};
