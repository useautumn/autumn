import type {
	Entity,
	Feature,
	FullCusEntWithFullCusProduct,
} from "@autumn/shared";
import type { AutumnContext } from "../../../honoUtils/HonoEnv.js";
import { performDeductionOnCusEnt } from "../../../trigger/updateBalanceTask.js";
import { CusEntService } from "../../customers/cusProducts/cusEnts/CusEntitlementService.js";
import { filterCusEnts } from "../../customers/cusProducts/cusEnts/cusEntUtils/findCusEntUtils.js";

export const deductFromAdditionalBalance = async ({
	cusEnts,
	entity,
	feature,
	toDeduct,
	ctx,
}: {
	cusEnts: FullCusEntWithFullCusProduct[];
	entity?: Entity;
	feature: Feature;
	toDeduct: number;
	ctx: AutumnContext;
}) => {
	const { db, features } = ctx;

	const filteredCusEnts = filterCusEnts({
		cusEnts,
		feature,
		entity,
		features,
	}) as FullCusEntWithFullCusProduct[];

	// console.log("Deducting from additional balance");
	for (let i = 0; i < filteredCusEnts.length; i++) {
		const cusEnt = filteredCusEnts[i];

		const {
			newBalance,
			newEntities,
			toDeduct: newToDeduct,
		} = performDeductionOnCusEnt({
			cusEnt,
			toDeduct,
			entityId: entity?.id,
			allowNegativeBalance: false,
			field: "additional_balance",
		});

		// Update cus ent in place
		filteredCusEnts[i] = {
			...cusEnt,
			additional_balance: newBalance,
			entities: newEntities,
		};

		await CusEntService.update({
			db,
			id: cusEnt.id,
			updates: {
				additional_balance: newBalance,
				entities: newEntities,
			},
		});

		toDeduct = newToDeduct;
		if (toDeduct === 0) break;
	}

	return toDeduct;
};
