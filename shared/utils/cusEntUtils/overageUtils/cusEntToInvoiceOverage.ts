import { nullish } from "@utils/utils";
import { Decimal } from "decimal.js";
import type { CustomerEntitlementWithPricesView } from "../../../models/cusProductModels/cusEntModels/fullCustomerEntitlementView";
import { isEntityScopedCusEnt } from "../classifyCusEntUtils";

export const cusEntToInvoiceOverage = ({
	cusEnt,
	entityId,
}: {
	cusEnt: CustomerEntitlementWithPricesView;
	entityId?: string;
}) => {
	if (isEntityScopedCusEnt(cusEnt)) {
		let totalOverage = new Decimal(0);
		if (nullish(entityId)) {
			for (const [_, entity] of Object.entries(cusEnt.entities || {})) {
				const overage = Decimal.max(0, new Decimal(-entity.balance));

				totalOverage = totalOverage.add(overage);
			}

			return totalOverage.toNumber();
		} else {
			const entity = cusEnt.entities?.[entityId];
			if (nullish(entity)) return 0;
			const overage = Decimal.max(0, new Decimal(-entity.balance));
			return overage.toNumber();
		}
	}

	const overage = Decimal.max(0, new Decimal(-(cusEnt.balance || 0)));
	return overage.toNumber();
};
