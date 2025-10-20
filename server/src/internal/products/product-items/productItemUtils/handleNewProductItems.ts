import type {
	AppEnv,
	Entitlement,
	Feature,
	Price,
	Product,
	ProductItem,
} from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { FeatureService } from "@/internal/features/FeatureService.js";
import { PriceService } from "@/internal/products/prices/PriceService.js";
import { EntitlementService } from "../../entitlements/EntitlementService.js";
import { validateProductItems } from "../validateProductItems.js";
import { isFeatureItem } from "./getItemType.js";
import { itemToPriceAndEnt } from "./itemToPriceAndEnt.js";

const updateDbPricesAndEnts = async ({
	db,
	newPrices,
	newEnts,
	updatedPrices,
	updatedEnts,
	deletedPrices,
	deletedEnts,
}: {
	db: DrizzleCli;
	newPrices: Price[];
	newEnts: Entitlement[];
	updatedPrices: Price[];
	updatedEnts: Entitlement[];
	deletedPrices: Price[];
	deletedEnts: Entitlement[];
}) => {
	// 1. Create new ents

	await Promise.all([
		EntitlementService.insert({
			db,
			data: newEnts,
		}),
		EntitlementService.upsert({
			db,
			data: updatedEnts,
		}),
	]);

	// 2. Create new prices
	await Promise.all([
		PriceService.insert({
			db,
			data: newPrices,
		}),
		PriceService.upsert({
			db,
			data: updatedPrices,
		}),
		PriceService.deleteInIds({
			db,
			ids: deletedPrices.map((price) => price.id!),
		}),
	]);

	// Check if any custom prices use this entitlement...
	const deletedEntIds = deletedEnts.map((ent) => ent.id!);
	const customPrices = await PriceService.getCustomInEntIds({
		db,
		entitlementIds: deletedEntIds,
	});

	if (customPrices.length === 0) {
		// Update the entitlement to be custom...
		await EntitlementService.deleteInIds({
			db,
			ids: deletedEntIds,
		});
	} else {
		const updateOrDelete: any = [];
		for (const ent of deletedEnts) {
			const hasCustomPrice = customPrices.some(
				(price) => price.entitlement_id === ent.id,
			);

			if (hasCustomPrice) {
				updateOrDelete.push(
					EntitlementService.update({
						db,
						id: ent.id!,
						updates: {
							is_custom: true,
						},
					}),
				);
			} else {
				updateOrDelete.push(
					EntitlementService.deleteInIds({
						db,
						ids: [ent.id!],
					}),
				);
			}
		}

		await Promise.all(updateOrDelete);
	}
};

const handleCustomProductItems = async ({
	db,
	newPrices,
	newEnts,
	updatedPrices,
	updatedEnts,
	samePrices,
	sameEnts,
	features,
}: {
	db: DrizzleCli;
	newPrices: Price[];
	newEnts: Entitlement[];
	updatedPrices: Price[];
	updatedEnts: Entitlement[];
	samePrices: Price[];
	sameEnts: Entitlement[];
	features: Feature[];
}) => {
	// await EntitlementService.insert({
	//   db,
	//   data: [...newEnts, ...updatedEnts],
	// });

	// await PriceService.insert({
	//   db,
	//   data: [...newPrices, ...updatedPrices],
	// });

	return {
		prices: [...newPrices, ...updatedPrices, ...samePrices],
		entitlements: [...newEnts, ...updatedEnts, ...sameEnts].map((ent) => ({
			...ent,
			feature: features.find((f) => f.id === ent.feature_id),
		})),
		customPrices: [...newPrices, ...updatedPrices],
		customEnts: [...newEnts, ...updatedEnts],
	};
};

export const handleNewProductItems = async ({
	db,
	curPrices,
	curEnts,
	newItems,
	features,
	product,
	logger,
	isCustom,
	newVersion,
	saveToDb = true,
}: {
	db: DrizzleCli;
	curPrices: Price[];
	curEnts: Entitlement[];
	newItems: ProductItem[];
	features: Feature[];
	product: Product;
	logger: any;
	isCustom: boolean;
	newVersion?: boolean;
	saveToDb?: boolean;
}) => {
	// Create features if not exist...
	if (!newItems) {
		return {
			prices: [],
			entitlements: [],
			customPrices: [],
			customEnts: [],
		};
	}

	// Validate product items...
	const { allFeatures, newFeatures } = validateProductItems({
		newItems,
		features,
		orgId: product.org_id!,
		env: product.env as AppEnv,
	});

	// addIdsToItems()
	// //1. Base price -> gets another fixed price ID.
	// //2. group plan features by feature ID#
	// //3. sort by price, then usage_model
	// //3.

	features = allFeatures;

	const newPrices: Price[] = [];
	const newEnts: Entitlement[] = [];

	const updatedPrices: Price[] = [];
	const updatedEnts: Entitlement[] = [];

	const deletedPrices: Price[] = curPrices.filter((price) => {
		// Check if this price matches any new item (by ID or feature+interval)
		const item = newItems.find(
			(item) =>
				item.price_id === price.id ||
				(!item.price_id &&
					price.feature_id === item.feature_id &&
					price.interval === item.interval),
		);
		if (!item) {
			return true;
		}

		return isFeatureItem(item);
	});

	const deletedEnts: Entitlement[] = curEnts.filter(
		(ent) =>
			!newItems.some(
				(item) =>
					item.entitlement_id === ent.id ||
					(!item.entitlement_id &&
						item.feature_id === ent.feature_id &&
						item.interval === ent.interval),
			),
	);

	const samePrices: Price[] = [];
	const sameEnts: Entitlement[] = [];

	for (const item of newItems) {
		const feature = features.find((f) => f.id === item.feature_id);

		// Match existing entitlement by ID (V1.2) or feature_id+interval (V2 Plan format)
		const curEnt = curEnts.find((ent) => {
			// Primary: match by entitlement_id if present
			if (item.entitlement_id) {
				return ent.id === item.entitlement_id;
			}

			// Fallback: match by feature_id + interval (V2 Plan format without entitlement_id)
			return (
				ent.feature_id === item.feature_id && ent.interval === item.interval
			);
		});

		// Match existing price by ID (V1.2) or feature_id+interval (V2)
		const curPrice = curPrices.find((price) => {
			// Primary: match by price_id if present
			if (item.price_id) {
				return price.id === item.price_id;
			}

			// Fallback: match by feature_id + interval for usage prices
			return (
				price.feature_id === item.feature_id && price.interval === item.interval
			);
		});

		// 2. Update price and entitlement?
		const { newPrice, newEnt, updatedPrice, updatedEnt, samePrice, sameEnt } =
			itemToPriceAndEnt({
				item,
				orgId: product.org_id!,
				internalProductId: product.internal_id!,
				feature: feature,
				curPrice,
				curEnt,
				isCustom,
				newVersion,
				features,
			});

		if (newPrice) {
			newPrices.push(newPrice);
		}

		if (newEnt) {
			newEnts.push(newEnt);
		}

		if (updatedPrice) {
			updatedPrices.push(updatedPrice);
		}

		if (updatedEnt) {
			updatedEnts.push(updatedEnt);
		}

		if (samePrice) {
			samePrices.push(samePrice);
		}

		if (sameEnt) {
			sameEnts.push(sameEnt);
		}
	}

	if (newFeatures.length > 0 && saveToDb) {
		await FeatureService.insert({
			db,
			data: newFeatures,
			logger,
		});
	}

	if ((isCustom || newVersion) && saveToDb) {
		return handleCustomProductItems({
			db,
			newPrices,
			newEnts,
			updatedPrices,
			updatedEnts,
			samePrices,
			sameEnts,
			features,
		});
	}

	if (saveToDb) {
		await updateDbPricesAndEnts({
			db,
			newPrices,
			newEnts,
			updatedPrices,
			updatedEnts,
			deletedPrices,
			deletedEnts,
		});
	}

	console.log(`
		Update Confirmations:
		- New ${newEnts.length} entitlements: ${JSON.stringify(newEnts, null, 4)}
		- Updated ${updatedEnts.length} entitlements: ${JSON.stringify(updatedEnts, null, 4)}
		- Deleted ${deletedEnts.length} entitlements: ${JSON.stringify(deletedEnts, null, 4)}
	`);

	return {
		prices: [...newPrices, ...updatedPrices],
		entitlements: [...newEnts, ...updatedEnts].map((ent) => ({
			...ent,
			feature: features.find((f) => f.id === ent.feature_id),
		})),
		customPrices: [],
		customEnts: [],
	};
};
