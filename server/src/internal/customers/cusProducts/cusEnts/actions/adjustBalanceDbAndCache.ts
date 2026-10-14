import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { CusEntService } from "../CusEntitlementService.js";
import { adjustSubjectBalanceCache } from "./cache/adjustSubjectBalanceCache.js";

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

	await adjustSubjectBalanceCache({
		ctx,
		customerId,
		featureId,
		customerEntitlementId: cusEntId,
		delta,
	});

	return updatedCustomerEntitlement;
};
