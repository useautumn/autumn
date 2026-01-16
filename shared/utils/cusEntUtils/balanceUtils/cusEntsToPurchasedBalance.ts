import { cusEntToCusPrice } from "@utils/cusEntUtils/convertCusEntUtils/cusEntToCusPrice.js";
import { Decimal } from "decimal.js";
import type { FullCustomerEntitlement } from "../../../models/cusProductModels/cusEntModels/cusEntModels.js";
import type { FullCusEntWithFullCusProduct } from "../../../models/cusProductModels/cusEntModels/cusEntWithProduct.js";
import { BillingType } from "../../../models/productModels/priceModels/priceEnums.js";
import { getBillingType } from "../../productUtils/priceUtils.js";
import { nullish, sumValues } from "../../utils.js";
import { isEntityScopedCusEnt } from "../classifyCusEntUtils.js";
import { cusEntToPrepaidQuantity } from "./cusEntsToPrepaidQuantity.js";

export const getCusEntMainOverage = ({
	cusEnt,
	entityId,
}: {
	cusEnt: FullCustomerEntitlement;
	entityId?: string;
}) => {
	if (isEntityScopedCusEnt(cusEnt)) {
		if (nullish(entityId)) {
			const entities = Object.values(cusEnt.entities ?? {});
			return sumValues(entities.map((entity) => Math.max(0, -entity.balance)));
		} else {
			const entityBalance = cusEnt.entities?.[entityId]?.balance;

			return Math.max(0, -(entityBalance ?? 0));
		}
	}

	return Math.max(0, -(cusEnt.balance ?? 0));
};

export const cusEntToPurchasedBalance = ({
	cusEnt,
	entityId,
}: {
	cusEnt: FullCusEntWithFullCusProduct;
	entityId?: string;
}) => {
	const cusPrice = cusEntToCusPrice({ cusEnt });
	if (nullish(cusPrice)) {
		return getCusEntMainOverage({ cusEnt, entityId });
	}

	const billingType = getBillingType(cusPrice.price.config);

	if (billingType === BillingType.UsageInAdvance) {
		// Purchased balance is how much was prepaid
		const prepaidQuantity = cusEntToPrepaidQuantity({
			cusEnt,
			sumAcrossEntities: nullish(entityId),
		});

		const mainOverage = getCusEntMainOverage({ cusEnt, entityId });

		return new Decimal(prepaidQuantity).add(mainOverage).toNumber();
	}

	return getCusEntMainOverage({ cusEnt, entityId });
};

export const cusEntsToPurchasedBalance = ({
	cusEnts,
	entityId,
}: {
	cusEnts: FullCusEntWithFullCusProduct[];
	entityId?: string;
}) => {
	return sumValues(
		cusEnts.map((cusEnt) => cusEntToPurchasedBalance({ cusEnt, entityId })),
	);
};
