import type {
	CustomizePlanV1,
	Entitlement,
	Feature,
	FullCusEntWithFullCusProduct,
	FullCusProduct,
	FullCustomerEntitlement,
	FullCustomerPrice,
	Price,
	UpdatePlanItemParamsV1,
} from "@autumn/shared";
import {
	ErrCode,
	RecaseError,
	ResetInterval,
	resetIntvToEntIntv,
} from "@autumn/shared";
import { planItemFilterMatchesCustomerPair } from "@shared/api/products/items/utils/match";
import { cusEntToCusPrice } from "@shared/utils/cusEntUtils/convertCusEntUtils/cusEntToCusPrice";
import { customerPriceToCustomerEntitlement } from "@shared/utils/cusPriceUtils/convertCustomerPrice/customerPriceToCustomerEntitlement";
import { StatusCodes } from "http-status-codes";
import { generateId } from "@/utils/genUtils";

type CustomerProductItemPair = {
	customerPrice?: FullCustomerPrice;
	customerEntitlement?: FullCustomerEntitlement;
};

const getCustomerProductItemPairs = ({
	targetCustomerProduct,
}: {
	targetCustomerProduct: FullCusProduct;
}): CustomerProductItemPair[] => {
	const pairs: CustomerProductItemPair[] =
		targetCustomerProduct.customer_prices.map((customerPrice) => ({
			customerPrice,
			customerEntitlement: customerPriceToCustomerEntitlement({
				customerPrice,
				customerEntitlements: targetCustomerProduct.customer_entitlements,
			}),
		}));

	for (const customerEntitlement of targetCustomerProduct.customer_entitlements) {
		const customerPrice = cusEntToCusPrice({
			cusEnt: {
				...customerEntitlement,
				customer_product: targetCustomerProduct,
			} satisfies FullCusEntWithFullCusProduct,
		});

		if (!customerPrice) {
			pairs.push({ customerEntitlement });
		}
	}

	return pairs;
};

const assertAllowedIntervalUpdate = ({
	customerPrice,
	overrides,
}: {
	customerPrice?: FullCustomerPrice;
	overrides: UpdatePlanItemParamsV1;
}) => {
	if (overrides.interval === undefined || !customerPrice) return;

	throw new RecaseError({
		message:
			"update_items cannot change intervals for paid items. Use remove_items and add_items instead.",
		code: ErrCode.InvalidProductItem,
		statusCode: StatusCodes.BAD_REQUEST,
	});
};

const applyOverridesToEntitlement = ({
	source,
	customerPrice,
	overrides,
}: {
	source: Entitlement;
	customerPrice?: FullCustomerPrice;
	overrides: UpdatePlanItemParamsV1;
}): Entitlement => {
	assertAllowedIntervalUpdate({ customerPrice, overrides });

	return {
		...source,
		id: generateId("ent"),
		is_custom: true,
		created_at: Date.now(),
		allowance:
			overrides.included !== undefined ? overrides.included : source.allowance,
		interval:
			overrides.interval !== undefined
				? resetIntvToEntIntv({ resetIntv: overrides.interval })
				: source.interval,
	};
};

const applyOverridesToPrice = ({
	source,
	newEntitlementId,
}: {
	source: Price;
	newEntitlementId: string;
}): Price => ({
	...source,
	id: generateId("pr"),
	is_custom: true,
	created_at: Date.now(),
	entitlement_id: newEntitlementId,
});

/** Patch existing items in place by emitting matched items as delete + add buckets.
 * Existing usage and rollovers carry forward via patch carry links. */
export const handleCustomizeUpdateItems = ({
	customize,
	targetCustomerProduct,
	features: _features,
}: {
	customize: CustomizePlanV1;
	targetCustomerProduct: FullCusProduct;
	features: Feature[];
}): {
	customerPrices: FullCustomerPrice[];
	customerEntitlements: FullCustomerEntitlement[];
	prices: Price[];
	entitlements: Entitlement[];
	carryLinks: {
		fromCustomerEntitlementId: string;
		toEntitlementId: string;
	}[];
} => {
	const updateItems = customize.update_items ?? [];
	if (updateItems.length === 0) {
		return {
			customerPrices: [],
			customerEntitlements: [],
			prices: [],
			entitlements: [],
			carryLinks: [],
		};
	}

	const deleteCustomerPriceIds = new Set<string>();
	const deleteCustomerEntitlementIds = new Set<string>();
	const deleteCustomerPrices: FullCustomerPrice[] = [];
	const deleteCustomerEntitlements: FullCustomerEntitlement[] = [];
	const newPrices: Price[] = [];
	const newEntitlements: Entitlement[] = [];
	const carryLinks: {
		fromCustomerEntitlementId: string;
		toEntitlementId: string;
	}[] = [];

	const pairs = getCustomerProductItemPairs({ targetCustomerProduct });

	for (const update of updateItems) {
		const matchedPairs = pairs.filter((pair) =>
			planItemFilterMatchesCustomerPair({
				filter: update.filter,
				customerPrice: pair.customerPrice,
				customerEntitlement: pair.customerEntitlement,
			}),
		);

		for (const pair of matchedPairs) {
			if (!pair.customerEntitlement) continue;
			if (deleteCustomerEntitlementIds.has(pair.customerEntitlement.id))
				continue;

			const newEntitlement = applyOverridesToEntitlement({
				source: pair.customerEntitlement.entitlement,
				customerPrice: pair.customerPrice,
				overrides: update,
			});
			newEntitlements.push(newEntitlement);
			carryLinks.push({
				fromCustomerEntitlementId: pair.customerEntitlement.id,
				toEntitlementId: newEntitlement.id,
			});
			deleteCustomerEntitlements.push(pair.customerEntitlement);
			deleteCustomerEntitlementIds.add(pair.customerEntitlement.id);

			if (
				pair.customerPrice &&
				!deleteCustomerPriceIds.has(pair.customerPrice.id)
			) {
				const newPrice = applyOverridesToPrice({
					source: pair.customerPrice.price,
					newEntitlementId: newEntitlement.id,
				});
				newPrices.push(newPrice);
				deleteCustomerPrices.push(pair.customerPrice);
				deleteCustomerPriceIds.add(pair.customerPrice.id);
			}
		}
	}

	// Also remove any sibling customer_prices whose price is linked to an
	// entitlement being deleted — keeps `targetCustomerProduct` consistent.
	for (const customerPrice of targetCustomerProduct.customer_prices) {
		if (deleteCustomerPriceIds.has(customerPrice.id)) continue;
		const entitlementId = customerPrice.price.entitlement_id;
		if (!entitlementId) continue;
		const matchesDeletedEnt = deleteCustomerEntitlements.some(
			(deleted) => deleted.entitlement.id === entitlementId,
		);
		if (matchesDeletedEnt) {
			deleteCustomerPrices.push(customerPrice);
			deleteCustomerPriceIds.add(customerPrice.id);
		}
	}

	targetCustomerProduct.customer_entitlements =
		targetCustomerProduct.customer_entitlements.filter(
			(customerEntitlement) =>
				!deleteCustomerEntitlementIds.has(customerEntitlement.id),
		);
	targetCustomerProduct.customer_prices =
		targetCustomerProduct.customer_prices.filter(
			(customerPrice) => !deleteCustomerPriceIds.has(customerPrice.id),
		);

	return {
		customerPrices: deleteCustomerPrices,
		customerEntitlements: deleteCustomerEntitlements,
		prices: newPrices,
		entitlements: newEntitlements,
		carryLinks,
	};
};
