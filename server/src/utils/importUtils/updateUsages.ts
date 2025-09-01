import type { FullCustomer } from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { RELEVANT_STATUSES } from "@/internal/customers/cusProducts/CusProductService.js";
import { CusEntService } from "@/internal/customers/cusProducts/cusEnts/CusEntitlementService.js";
import { cusProductsToCusEnts } from "@/internal/customers/cusProducts/cusProductUtils/convertCusProduct.js";

export const updateUsages = async ({
	featureId,
	usage,
	fullCus,
	db,
}: {
	featureId: string;
	usage: number;
	fullCus: FullCustomer;
	db: DrizzleCli;
}) => {
	const cusEnts = cusProductsToCusEnts({
		cusProducts: fullCus.customer_products,
		inStatuses: RELEVANT_STATUSES,
		featureId,
	});
	if (cusEnts.length === 0) {
		throw new Error(`No cus ent for ${featureId}`);
	}

	const cusEnt = cusEnts[0];
	const newBalance = cusEnt.balance! - usage;

	await CusEntService.update({
		db,
		id: cusEnt.id,
		updates: {
			balance: newBalance,
		},
	});
};
