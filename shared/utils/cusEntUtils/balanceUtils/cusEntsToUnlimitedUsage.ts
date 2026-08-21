import { Decimal } from "decimal.js";
import type { FullCusEntWithFullCusProduct } from "../../../models/cusProductModels/cusEntModels/cusEntWithProduct";
import { AllowanceType } from "../../../models/productModels/entModels/entModels.js";

const isUnlimitedUsageCusEnt = (cusEnt: FullCusEntWithFullCusProduct) =>
	cusEnt.entitlement.allowance_type === AllowanceType.Unlimited ||
	Boolean(cusEnt.unlimited);

export const cusEntsToUnlimitedUsage = ({
	cusEnts,
	entityId,
}: {
	cusEnts: FullCusEntWithFullCusProduct[];
	entityId?: string;
}): number => {
	let totalBalance = new Decimal(0);

	for (const cusEnt of cusEnts.filter(isUnlimitedUsageCusEnt)) {
		const isEntityScoped = Boolean(cusEnt.entitlement.entity_feature_id);

		if (entityId && isEntityScoped) {
			// Entity view: only this entity's slice of an entity-scoped cusEnt
			totalBalance = totalBalance.add(
				cusEnt.entities?.[entityId]?.balance ?? 0,
			);
			continue;
		}

		// Customer view (or a customer-level pool seen from an entity view):
		// top-level balance plus every per-entity balance
		totalBalance = totalBalance.add(cusEnt.balance ?? 0);
		if (!entityId) {
			for (const entityBalance of Object.values(cusEnt.entities ?? {})) {
				totalBalance = totalBalance.add(entityBalance.balance ?? 0);
			}
		}
	}

	// Usage is the negated balance; no clamping so refund overshoot
	// (positive balance) reports negative usage faithfully
	return totalBalance.neg().toNumber();
};
