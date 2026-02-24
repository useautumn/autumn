import {
	type FullCustomer,
	fullCustomerToCustomerEntitlements,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { RELEVANT_STATUSES } from "@/internal/customers/cusProducts/CusProductService.js";
import { CusEntService } from "@/internal/customers/cusProducts/cusEnts/CusEntitlementService.js";

export const updateUsages = async ({
	ctx,
	featureId,
	usage,
	fullCus,
}: {
	ctx: AutumnContext;
	featureId: string;
	usage: number;
	fullCus: FullCustomer;
}) => {
	const cusEnts = fullCustomerToCustomerEntitlements({
		fullCustomer: fullCus,
		inStatuses: RELEVANT_STATUSES,
		featureId,
	});
	if (cusEnts.length === 0) {
		throw new Error(`No cus ent for ${featureId}`);
	}

	const cusEnt = cusEnts[0];
	const newBalance = cusEnt.balance! - usage;

	await CusEntService.update({
		ctx,
		id: cusEnt.id,
		updates: {
			balance: newBalance,
		},
	});
};
