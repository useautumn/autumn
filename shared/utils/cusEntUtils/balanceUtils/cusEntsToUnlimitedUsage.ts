import { Decimal } from "decimal.js";
import type { CustomerEntitlementWithPricesView } from "../../../models/cusProductModels/cusEntModels/fullCustomerEntitlementView";
import { AllowanceType } from "../../../models/productModels/entModels/entModels.js";

const isUnlimitedUsageCusEnt = (cusEnt: CustomerEntitlementWithPricesView) =>
	cusEnt.entitlement.allowance_type === AllowanceType.Unlimited ||
	Boolean(cusEnt.unlimited);

export const cusEntsToUnlimitedUsage = ({
	cusEnts,
	entityId,
}: {
	cusEnts: CustomerEntitlementWithPricesView[];
	entityId?: string;
}): number => {
	let totalBalance = new Decimal(0);

	for (const cusEnt of cusEnts.filter(isUnlimitedUsageCusEnt)) {
		const isEntityScoped = Boolean(cusEnt.entitlement.entity_feature_id);

		if (entityId && isEntityScoped) {
			totalBalance = totalBalance.add(
				cusEnt.entities?.[entityId]?.balance ?? 0,
			);
			continue;
		}

		totalBalance = totalBalance.add(cusEnt.balance ?? 0);
		if (!entityId) {
			for (const entityBalance of Object.values(cusEnt.entities ?? {})) {
				totalBalance = totalBalance.add(entityBalance.balance ?? 0);
			}
		}
	}

	return totalBalance.neg().toNumber();
};
