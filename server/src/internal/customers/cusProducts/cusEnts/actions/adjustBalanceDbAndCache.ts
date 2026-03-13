import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { CusEntService } from "../CusEntitlementService.js";
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
}: {
	ctx: AutumnContext;
	customerId: string;
	cusEntId: string;
	delta: number;
}) => {
	if (delta === 0) return;

	if (delta > 0) {
		await CusEntService.increment({ ctx, id: cusEntId, amount: delta });
	} else {
		await CusEntService.decrement({
			ctx,
			id: cusEntId,
			amount: Math.abs(delta),
		});
	}

	await incrementCachedCusEntBalance({ ctx, customerId, cusEntId, delta });
};
