import { Decimal } from "decimal.js";
import type { CustomerEntitlementWithPricesView } from "../../../../models/cusProductModels/cusEntModels/fullCustomerEntitlementView";
import { sumValues } from "../../../utils";
import { getCusEntBalance } from "../../balanceUtils";
import { getRolloverFields } from "../../getRolloverFields";

// NEW CUS ENT UTILS
export const cusEntsToAllowance = ({
	cusEnts,
	entityId,
	withRollovers = false,
}: {
	cusEnts: CustomerEntitlementWithPricesView[];
	entityId?: string;
	withRollovers?: boolean;
}) => {
	const getAllowance = ({
		cusEnt,
		entityId,
		withRollovers = false,
	}: {
		cusEnt: CustomerEntitlementWithPricesView;
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

		const grantedBalance =
			cusEnt.pooled_balance?.granted ?? cusEnt.entitlement.allowance ?? 0;

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
