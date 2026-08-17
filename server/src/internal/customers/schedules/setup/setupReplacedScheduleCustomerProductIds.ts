import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { selectCustomerSchedulesWithPhases } from "../repos/selectCustomerSchedulesWithPhases.js";

/**
 * Customer products the customer's existing schedules put in place. A new
 * schedule replaces all of them, so only these may be expired when the new
 * phases drop them — anything no schedule ever placed is none of its business.
 */
export const setupReplacedScheduleCustomerProductIds = async ({
	ctx,
	internalCustomerId,
}: {
	ctx: AutumnContext;
	internalCustomerId: string;
}): Promise<string[]> => {
	const customerSchedules = await selectCustomerSchedulesWithPhases({
		ctx,
		internalCustomerId,
	});

	const replacedProductIds = customerSchedules.flatMap((schedule) =>
		schedule.phases.flatMap((phase) => phase.customer_product_ids),
	);

	return [...new Set(replacedProductIds)];
};
