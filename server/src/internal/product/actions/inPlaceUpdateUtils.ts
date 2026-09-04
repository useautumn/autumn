import {
	entitlements,
	type Feature,
	type FullProduct,
	findSimilarItem,
	itemsAreSame,
	mapToProductItems,
	type ProductItem,
	prices,
	products,
} from "@autumn/shared";
import type { DrizzleCli } from "@server/db/initDrizzle";
import { eq, inArray } from "drizzle-orm";
import { CusEntService } from "@/internal/customers/cusProducts/cusEnts/CusEntitlementService.js";
import { CusPriceService } from "@/internal/customers/cusProducts/cusPrices/CusPriceService.js";
import { licenseItemRepo } from "@/internal/licenses/repos/licenseItemRepo.js";
import { EntitlementService } from "@/internal/products/entitlements/EntitlementService.js";
import { PriceService } from "@/internal/products/prices/PriceService.js";

// Includes the base price: a base-price edit must retire the old shared row too,
// not mutate it in place under existing customers.
const currentItemsOf = ({
	currentFullProduct,
	features,
}: {
	currentFullProduct: FullProduct;
	features: Feature[];
}): ProductItem[] =>
	mapToProductItems({
		prices: currentFullProduct.prices,
		entitlements: currentFullProduct.entitlements,
		features,
	});

/** Serializes item writers before they reload the current catalog rows. */
export const lockProductForItemUpdate = async ({
	db,
	internalProductId,
}: {
	db: DrizzleCli;
	internalProductId: string;
}) => {
	await db
		.select({ internalId: products.internal_id })
		.from(products)
		.where(eq(products.internal_id, internalProductId))
		.for("no key update");
};

/** Locks sorted item rows so customer references cannot race item retirement. */
export const lockProductItemsForUpdate = async ({
	db,
	currentFullProduct,
}: {
	db: DrizzleCli;
	currentFullProduct: FullProduct;
}) => {
	const entitlementIds = currentFullProduct.entitlements
		.map((entitlement) => entitlement.id)
		.sort();
	const priceIds = currentFullProduct.prices.map((price) => price.id).sort();

	if (entitlementIds.length > 0) {
		await db
			.select({ id: entitlements.id })
			.from(entitlements)
			.where(inArray(entitlements.id, entitlementIds))
			.orderBy(entitlements.id)
			.for("update");
	}

	if (priceIds.length > 0) {
		await db
			.select({ id: prices.id })
			.from(prices)
			.where(inArray(prices.id, priceIds))
			.orderBy(prices.id)
			.for("update");
	}
};

export const productItemsHaveCustomerReferences = async ({
	db,
	currentFullProduct,
}: {
	db: DrizzleCli;
	currentFullProduct: FullProduct;
}): Promise<boolean> => {
	const entitlementIds = currentFullProduct.entitlements.map(
		(entitlement) => entitlement.id,
	);
	const priceIds = currentFullProduct.prices.map((price) => price.id);
	const [
		hasEntitlementReferences,
		hasPriceReferences,
		licenseEntitlementReferences,
		licensePriceReferences,
	] = await Promise.all([
		CusEntService.hasAnyEntitlementReferences({
			db,
			entitlementIds,
		}),
		CusPriceService.hasAnyPriceReferences({
			db,
			priceIds,
		}),
		licenseItemRepo.listReferencedEntitlementIds({ db, entitlementIds }),
		licenseItemRepo.listReferencedPriceIds({ db, priceIds }),
	]);

	return (
		hasEntitlementReferences ||
		hasPriceReferences ||
		licenseEntitlementReferences.size > 0 ||
		licensePriceReferences.size > 0
	);
};

/**
 * Callers rarely echo back entitlement_id / price_id, so without this match the
 * unchanged items look new and the old rows get deleted (cascading the
 * customers' rows). Match incoming items to the current catalog by feature +
 * interval and carry their ids forward.
 */
const backfillExistingItemIds = ({
	items,
	currentFullProduct,
	features,
}: {
	items: ProductItem[];
	currentFullProduct: FullProduct;
	features: Feature[];
}): ProductItem[] => {
	const currentItems = currentItemsOf({ currentFullProduct, features });

	return items.map((item) => {
		if (item.entitlement_id || item.price_id) return item;
		const match = findSimilarItem({ item, items: currentItems });
		if (!match) return item;
		return {
			...item,
			...(match.entitlement_id ? { entitlement_id: match.entitlement_id } : {}),
			...(match.price_id ? { price_id: match.price_id } : {}),
		};
	});
};

/** Leave unused catalog rows in place as is_custom so deferred FKs stay valid. */
const retireCatalogRows = async ({
	db,
	entitlementIds,
	priceIds,
}: {
	db: DrizzleCli;
	entitlementIds: string[];
	priceIds: string[];
}) => {
	await PriceService.retireInIds({ db, ids: priceIds });
	await EntitlementService.retireInIds({ db, ids: entitlementIds });
};

/**
 * Carry unchanged item ids forward and retire replaced catalog rows (is_custom).
 * Existing customer/license FKs keep pointing at the retired definition.
 */
export const resolveInPlaceEdit = async ({
	db,
	items,
	currentFullProduct,
	features,
}: {
	db: DrizzleCli;
	items: ProductItem[];
	currentFullProduct: FullProduct;
	features: Feature[];
}): Promise<{
	items: ProductItem[];
	curPrices: FullProduct["prices"];
	curEnts: FullProduct["entitlements"];
}> => {
	const backfilledItems = backfillExistingItemIds({
		items,
		currentFullProduct,
		features,
	});
	const currentItems = currentItemsOf({ currentFullProduct, features });

	const retiredEntitlementIds: string[] = [];
	const retiredPriceIds: string[] = [];

	for (const currentItem of currentItems) {
		const match = findSimilarItem({
			item: currentItem,
			items: backfilledItems,
		});
		const isDeleted = !match;
		const isUpdated =
			match &&
			!itemsAreSame({ item1: match, item2: currentItem, features }).same;
		if (!(isDeleted || isUpdated)) continue;
		if (currentItem.entitlement_id)
			retiredEntitlementIds.push(currentItem.entitlement_id);
		if (currentItem.price_id) retiredPriceIds.push(currentItem.price_id);
	}

	await retireCatalogRows({
		db,
		entitlementIds: retiredEntitlementIds,
		priceIds: retiredPriceIds,
	});

	const retired = new Set([...retiredEntitlementIds, ...retiredPriceIds]);
	// Updated items must mint fresh is_custom:false rows, so drop the backfilled
	// ids that now point at retired rows.
	const preparedItems = backfilledItems.map((item) => {
		const retiresEnt = item.entitlement_id && retired.has(item.entitlement_id);
		const retiresPrice = item.price_id && retired.has(item.price_id);
		if (!(retiresEnt || retiresPrice)) return item;
		return { ...item, entitlement_id: undefined, price_id: undefined };
	});

	return {
		items: preparedItems,
		curPrices: currentFullProduct.prices.filter(
			(price) => !retired.has(price.id),
		),
		curEnts: currentFullProduct.entitlements.filter(
			(ent) => !retired.has(ent.id),
		),
	};
};
