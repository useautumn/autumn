import type {
	Entity,
	Feature,
	FullCusEntWithFullCusProduct,
} from "@autumn/shared";
import { Decimal } from "decimal.js";
import type { AutumnContext } from "../../../honoUtils/HonoEnv.js";
import { performDeductionOnCusEnt } from "../../../trigger/updateBalanceTask.js";
import { CusEntService } from "../../customers/cusProducts/cusEnts/CusEntitlementService.js";
import { filterCusEnts } from "../../customers/cusProducts/cusEnts/cusEntUtils/findCusEntUtils.js";

export const deductFromAdditionalGrantedBalance = async ({
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

	const printLogs = false;
	for (let i = 0; i < filteredCusEnts.length; i++) {
		const cusEnt = filteredCusEnts[i];

		if (printLogs) {
			console.log("BEFORE DEDUCTION:", {
				additional_granted_balance: cusEnt.additional_granted_balance,
				additional_balance: cusEnt.additional_balance,
				toDeduct,
			});
		}

		const {
			newBalance,
			newEntities,
			toDeduct: newToDeduct,
		} = performDeductionOnCusEnt({
			cusEnt,
			toDeduct,
			entityId: entity?.id,
			allowNegativeBalance: true,
			setZeroAdjustment: false,
			blockUsageLimit: true,
			field: "additional_granted_balance",
		});

		const toDeduct2 = new Decimal(toDeduct).minus(newToDeduct).toNumber();

		// Use updated cusEnt with new additional_granted_balance
		const updatedCusEnt = {
			...cusEnt,
			additional_granted_balance: newBalance,
			entities: newEntities,
		};

		const { newBalance: newBalance2, newEntities: newEntities2 } =
			performDeductionOnCusEnt({
				cusEnt: updatedCusEnt,
				toDeduct: toDeduct2,
				entityId: entity?.id,
				allowNegativeBalance: true,
				setZeroAdjustment: false,
				blockUsageLimit: true,
				field: "additional_balance",
			});

		// Update cus ent in place
		filteredCusEnts[i] = {
			...updatedCusEnt,
			additional_balance: newBalance2,
			entities: newEntities2,
		};

		if (printLogs) {
			console.log("FINAL UPDATE:", {
				additional_granted_balance: newBalance,
				additional_balance: newBalance2,
			});
		}

		await CusEntService.update({
			db,
			id: cusEnt.id,
			updates: {
				additional_balance: newBalance2,
				additional_granted_balance: newBalance,
				entities: newEntities2,
			},
		});

		toDeduct = newToDeduct;
		if (toDeduct === 0) break;
	}

	return toDeduct;
};
