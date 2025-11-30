import {
	type AppEnv,
	type Entitlement,
	type Feature,
	logEnts,
	logPrices,
	type Price,
	type Product,
	type ProductItem,
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

	features = allFeatures;

	const newPrices: Price[] = [];
	const newEnts: Entitlement[] = [];

	const updatedPrices: Price[] = [];
	const updatedEnts: Entitlement[] = [];

	const deletedPrices: Price[] = curPrices.filter((price) => {
		// Check if this price matches any new item (by ID or feature+interval)
		const item = newItems.find((item) => item.price_id === price.id);
		if (!item) {
			return true;
		}

		return isFeatureItem(item);
	});

	const deletedEnts: Entitlement[] = curEnts.filter(
		(ent) => !newItems.some((item) => item.entitlement_id === ent.id),
	);

	const samePrices: Price[] = [];
	const sameEnts: Entitlement[] = [];

	for (const item of newItems) {
		const feature = features.find((f) => f.id === item.feature_id);

		const curEnt = curEnts.find((ent) => ent.id === item.entitlement_id);
		const curPrice = curPrices.find((price) => price.id === item.price_id);

		// 3. Update price and entitlement?
		const { newPrice, newEnt, updatedPrice, updatedEnt, samePrice, sameEnt } =
			itemToPriceAndEnt({
				item,
				orgId: product.org_id,
				internalProductId: product.internal_id,
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

	const printLogs = false;
	if (printLogs) {
		logPrices({ prices: newPrices, prefix: "New prices" });
		logEnts({ ents: newEnts, prefix: "New entitlements" });
		logPrices({ prices: updatedPrices, prefix: "Updated prices" });
		logEnts({ ents: updatedEnts, prefix: "Updated entitlements" });
		logPrices({ prices: deletedPrices, prefix: "Deleted prices" });
		logEnts({ ents: deletedEnts, prefix: "Deleted entitlements" });
		logPrices({ prices: samePrices, prefix: "Same prices" });
		logEnts({ ents: sameEnts, prefix: "Same entitlements" });
	}
	// throw new Error("test");

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
