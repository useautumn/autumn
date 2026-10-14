import {
	type AutoTopup,
	cusEntsToBalance,
	cusEntToCusPrice,
	fullSubjectToPlanProducts,
	isCustomerProductRecurring,
	isOneOffPrice,
	isPrepaidPrice,
	resolveBillingControlWithProduct,
} from "@autumn/shared";
import { subjectToFeatureRows } from "./subjectToFeatureRows.js";
import type {
	AutoTopupChargeSource,
	AutoTopupCustomerEntitlement,
	AutoTopupCustomerProduct,
	AutoTopupFeatureRow,
	AutoTopupSubject,
} from "./types/autoTopupSubject.js";

const isChargeSource = <
	CE extends AutoTopupCustomerEntitlement,
	CP extends AutoTopupCustomerProduct,
>(
	row: AutoTopupFeatureRow<CE, CP>,
): row is AutoTopupChargeSource<CE, CP> =>
	row.customer_product != null && row.expires_at == null;

const isOneOffPrepaid = (
	row: AutoTopupCustomerEntitlement & {
		customer_product: AutoTopupCustomerProduct | null;
	},
): boolean => {
	const customerPrice = cusEntToCusPrice({ cusEnt: row });
	if (!customerPrice) return false;
	return (
		isOneOffPrice(customerPrice.price) && isPrepaidPrice(customerPrice.price)
	);
};

const chargeSourceRank = (row: {
	customer_product: AutoTopupCustomerProduct;
}): number => {
	const recurring = isCustomerProductRecurring(row.customer_product) ? 0 : 2;
	const addOn = row.customer_product.product.is_add_on ? 1 : 0;
	return recurring + addOn;
};

const attachedAt = (row: {
	customer_product: AutoTopupCustomerProduct;
}): number => row.customer_product.created_at ?? 0;

const attachedLater = ({
	left,
	right,
}: {
	left: { customer_product: AutoTopupCustomerProduct };
	right: { customer_product: AutoTopupCustomerProduct };
}): number => right.customer_product.id.localeCompare(left.customer_product.id);

export const subjectToAutoTopupObjects = <
	CE extends AutoTopupCustomerEntitlement,
	CP extends AutoTopupCustomerProduct,
>({
	fullSubject,
	featureId,
	now,
}: {
	fullSubject: AutoTopupSubject<CE, CP>;
	featureId: string;
	now: number;
}): {
	autoTopupConfig: AutoTopup;
	customerEntitlement: AutoTopupChargeSource<CE, CP>;
	balanceBelowThreshold: boolean;
} | null => {
	const resolved = resolveBillingControlWithProduct<
		"auto_topups",
		AutoTopup,
		CP
	>({
		controlLists: [fullSubject.customer.auto_topups],
		customerProducts: fullSubjectToPlanProducts({
			fullSubject: { customer_products: fullSubject.customer_products },
		}),
		controlKey: "auto_topups",
		matches: (config) => config.feature_id === featureId,
		now,
	});
	const autoTopupConfig = resolved?.control;
	if (!autoTopupConfig?.enabled) return null;

	const rows = subjectToFeatureRows({
		fullSubject,
		featureId,
		now,
	});
	if (rows.length === 0) return null;

	const candidates = rows.filter(
		(row): row is AutoTopupChargeSource<CE, CP> =>
			isChargeSource(row) && isOneOffPrepaid(row),
	);

	const sourceProductInternalId =
		resolved?.customerProduct?.internal_product_id;
	const customerEntitlement = sourceProductInternalId
		? candidates.find(
				(row) =>
					row.customer_product.internal_product_id === sourceProductInternalId,
			)
		: candidates.sort(
				(left, right) =>
					chargeSourceRank(left) - chargeSourceRank(right) ||
					attachedAt(right) - attachedAt(left) ||
					attachedLater({ left, right }),
			)[0];
	if (!customerEntitlement) return null;

	const remainingBalance = cusEntsToBalance({
		cusEnts: rows,
		withRollovers: true,
	});
	return {
		autoTopupConfig,
		customerEntitlement,
		balanceBelowThreshold: remainingBalance <= autoTopupConfig.threshold,
	};
};
