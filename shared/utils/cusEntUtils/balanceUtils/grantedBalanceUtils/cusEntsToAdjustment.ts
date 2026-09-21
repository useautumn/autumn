import type { CustomerEntitlementWithPricesView } from "../../../../models/cusProductModels/cusEntModels/fullCustomerEntitlementView";
import { sumValues } from "../../../utils";
import { getCusEntBalance } from "../../balanceUtils";

export const cusEntsToAdjustment = ({
	cusEnts,
	entityId,
}: {
	cusEnts: CustomerEntitlementWithPricesView[];
	entityId?: string;
}) => {
	return sumValues(
		cusEnts.map((cusEnt) => {
			const { adjustment } = getCusEntBalance({
				cusEnt,
				entityId,
			});
			return adjustment;
		}),
	);
};
