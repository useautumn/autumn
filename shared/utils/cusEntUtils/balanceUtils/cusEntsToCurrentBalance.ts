import { Decimal } from "decimal.js";
import type { FullCustomerEntitlement } from "../../../models/cusProductModels/cusEntModels/cusEntModels";
import type { FullCusEntWithFullCusProduct } from "../../../models/cusProductModels/cusEntModels/cusEntWithProduct";
import { AllowanceType } from "../../../models/productModels/entModels/entModels";
import { nullish, sumValues } from "../../utils";
import { isEntityScopedCusEnt } from "../classifyCusEntUtils";
import { getRolloverFields } from "../getRolloverFields";

export const cusEntToCurrentBalance = ({
	cusEnt,
	entityId,
	withRollovers = false,
}: {
	cusEnt: FullCustomerEntitlement;
	entityId?: string;
	withRollovers?: boolean;
}): number => {
	if (cusEnt.entitlement.allowance_type === AllowanceType.Unlimited) return 0;

	const getCusEntMainBalance = () => {
		if (isEntityScopedCusEnt({ cusEnt })) {
			if (nullish(entityId)) {
				const entities = Object.values(cusEnt.entities ?? {});
				return sumValues(entities.map((entity) => Math.max(0, entity.balance)));
			} else {
				const entityBalance = cusEnt.entities?.[entityId]?.balance;

				return Math.max(0, entityBalance ?? 0);
			}
		}

		return Math.max(0, cusEnt.balance ?? 0);
	};

	const mainBalance = getCusEntMainBalance();

	const rollover = getRolloverFields({
		cusEnt,
		entityId,
	});

	if (withRollovers && rollover) {
		return new Decimal(mainBalance).add(rollover.balance).toNumber();
	}

	return mainBalance;
};

export const cusEntsToCurrentBalance = ({
	cusEnts,
	entityId,
	withRollovers = false,
}: {
	cusEnts: FullCusEntWithFullCusProduct[];
	entityId?: string;
	withRollovers?: boolean;
}) => {
	// const cusEntToCurrentBalance = ({
	// 	cusEnt,
	// 	entityId,
	// 	withRollovers = false,
	// }: {
	// 	cusEnt: FullCusEntWithFullCusProduct;
	// 	entityId?: string;
	// 	withRollovers?: boolean;
	// }) => {
	// 	const balance = cusEntToBalance({
	// 		cusEnt,
	// 		entityId,
	// 		withRollovers,
	// 	});

	// 	const currentBalance = new Decimal(Math.max(0, balance)).toNumber();

	// 	return currentBalance;
	// };

	return sumValues(
		cusEnts.map((cusEnt) =>
			cusEntToCurrentBalance({ cusEnt, entityId, withRollovers }),
		),
	);
};
