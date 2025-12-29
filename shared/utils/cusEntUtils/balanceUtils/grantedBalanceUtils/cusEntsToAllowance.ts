import { Decimal } from "decimal.js";
import type { FullCusEntWithFullCusProduct, FullCusEntWithOptionalProduct } from "../../../../models/cusProductModels/cusEntModels/cusEntWithProduct";
import { sumValues } from "../../../utils";
import { getCusEntBalance } from "../../balanceUtils";
import { getRolloverFields } from "../../getRolloverFields";

// NEW CUS ENT UTILS
export const cusEntsToAllowance = ({
	cusEnts,
	entityId,
	withRollovers = false,
}: {
	cusEnts: (FullCusEntWithFullCusProduct | FullCusEntWithOptionalProduct)[];
	entityId?: string;
	withRollovers?: boolean;
}) => {
	const getAllowance = ({
		cusEnt,
		entityId,
		withRollovers = false,
	}: {
		cusEnt: FullCusEntWithFullCusProduct | FullCusEntWithOptionalProduct;
		entityId?: string;
		withRollovers?: boolean;
	}) => {
		const rollover = getRolloverFields({
			cusEnt,
			entityId,
		});

		const { count: entityCount } = getCusEntBalance({
			cusEnt,
			entityId,
		});

		const grantedBalance = cusEnt.entitlement.allowance || 0;

		const total = new Decimal(grantedBalance)
			.mul(cusEnt.customer_product?.quantity ?? 1)
			.mul(entityCount)
			.toNumber();

		if (withRollovers && rollover) {
			return new Decimal(total)
				.add(rollover.balance)
				.add(rollover.usage)
				.toNumber();
		}

		return total;
	};

	return sumValues(
		cusEnts.map((cusEnt) => getAllowance({ cusEnt, entityId, withRollovers })),
	);
};
