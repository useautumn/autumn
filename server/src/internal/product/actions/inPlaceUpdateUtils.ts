import {
	entitlements,
	type Feature,
	type FullProduct,
	findSimilarItem,
	itemsAreSame,
	mapToProductItems,
	type ProductItem,
	prices,
} from "@autumn/shared";
import type { DrizzleCli } from "@server/db/initDrizzle";
import { inArray } from "drizzle-orm";
import { CusEntService } from "@/internal/customers/cusProducts/cusEnts/CusEntitlementService.js";
import { CusPriceService } from "@/internal/customers/cusProducts/cusPrices/CusPriceService.js";
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

/** Locks sorted parent rows so FK inserts and concurrent catalog writes serialize. */
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
	const [hasEntitlementReferences, hasPriceReferences] = await Promise.all([
		CusEntService.hasAnyEntitlementReferences({
			db,
			entitlementIds: currentFullProduct.entitlements.map(
				(entitlement) => entitlement.id,
			),
		}),
		CusPriceService.hasAnyPriceReferences({
			db,
			priceIds: currentFullProduct.prices.map((price) => price.id),
		}),
	]);

	return hasEntitlementReferences || hasPriceReferences;
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

/**
 * Retire (vs mutate/delete) a catalog ent/price so existing customers that
 * reference it keep their definition. Referenced rows flip to is_custom:true
 * (hidden from the catalog, FK still valid); unreferenced rows are deleted.
 */
const retireOrDeleteRows = async ({
	db,
	entitlementIds,
	priceIds,
}: {
	db: DrizzleCli;
	entitlementIds: string[];
	priceIds: string[];
}) => {
	const referencedEnts = await CusEntService.getReferencedEntitlementIds({
		db,
		entitlementIds,
	});
	const referencedPrices = await CusPriceService.getReferencedPriceIds({
		db,
		priceIds,
	});
	const priceRows = await PriceService.getInIds({ db, ids: priceIds });
	const entitlementsReferencedByRetainedPrices = new Set(
		priceRows.flatMap((price) =>
			referencedPrices.has(price.id) && price.entitlement_id
				? [price.entitlement_id]
				: [],
		),
	);

	for (const priceId of priceIds) {
		if (referencedPrices.has(priceId)) {
			await PriceService.update({
				db,
				id: priceId,
				update: { is_custom: true },
			});
		} else {
			await PriceService.deleteInIds({ db, ids: [priceId] });
		}
	}

	for (const entitlementId of entitlementIds) {
		if (
			referencedEnts.has(entitlementId) ||
			entitlementsReferencedByRetainedPrices.has(entitlementId)
		) {
			await EntitlementService.update({
				db,
				id: entitlementId,
				updates: { is_custom: true },
			});
		} else {
			await EntitlementService.deleteInIds({ db, ids: [entitlementId] });
		}
	}
};

/**
 * Resolve an in-place edit (disable_version + customers) against the current
 * catalog. Carries forward unchanged ids, retires the rows behind UPDATE/DELETE
 * (is_custom flip when referenced, else delete) so existing customers are
 * untouched, and returns the items to insert plus the catalog prices/ents with
 * the retired rows removed — handed to `handleNewProductItems` so it does not
 * re-delete them.
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

	await retireOrDeleteRows({
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
