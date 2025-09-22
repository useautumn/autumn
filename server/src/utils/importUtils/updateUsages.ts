import { DrizzleCli } from "@/db/initDrizzle.js";
import { CusEntService } from "@/internal/customers/cusProducts/cusEnts/CusEntitlementService.js";
import { RELEVANT_STATUSES } from "@/internal/customers/cusProducts/CusProductService.js";
import { cusProductsToCusEnts } from "@autumn/shared";
import { FullCustomer } from "@autumn/shared";

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
	let cusEnts = cusProductsToCusEnts({
		cusProducts: fullCus.customer_products,
		inStatuses: RELEVANT_STATUSES,
		featureId,
	});
	if (cusEnts.length === 0) {
		throw new Error(`No cus ent for ${featureId}`);
	}

	let cusEnt = cusEnts[0];
	let newBalance = cusEnt.balance! - usage;

	await CusEntService.update({
		db,
		id: cusEnt.id,
		updates: {
			balance: newBalance,
		},
	});
};
