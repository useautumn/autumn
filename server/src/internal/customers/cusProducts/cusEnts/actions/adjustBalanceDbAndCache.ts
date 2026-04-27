import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { CusEntService } from "../CusEntitlementService.js";
import { adjustSubjectBalanceCache } from "./cache/adjustSubjectBalanceCache.js";
import { incrementCachedCusEntBalance } from "./cache/incrementCachedCusEntBalance.js";

/**
 * Adjusts a cusEnt balance in both Postgres and the Redis FullCustomer cache.
 * Positive delta increments, negative delta decrements.
 */
export const adjustBalanceDbAndCache = async ({
	ctx,
	customerId,
	cusEntId,
	delta,
	featureId,
}: {
	ctx: AutumnContext;
	customerId: string;
	cusEntId: string;
	delta: number;
	featureId: string;
}): Promise<
	Awaited<ReturnType<typeof CusEntService.increment>>[number] | undefined
> => {
	if (delta === 0) return undefined;

	const updatedRows =
		delta > 0
			? await CusEntService.increment({
					ctx,
					id: cusEntId,
					amount: delta,
				})
			: await CusEntService.decrement({
					ctx,
					id: cusEntId,
					amount: Math.abs(delta),
				});

	const updatedCustomerEntitlement = updatedRows[0];

	await Promise.all([
		incrementCachedCusEntBalance({ ctx, customerId, cusEntId, delta }),
		adjustSubjectBalanceCache({
			ctx,
			customerId,
			featureId,
			customerEntitlementId: cusEntId,
			delta,
		}),
	]);

	return updatedCustomerEntitlement;
};
