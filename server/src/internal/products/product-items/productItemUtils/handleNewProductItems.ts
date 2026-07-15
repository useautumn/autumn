import {
	type AppEnv,
	copyStripeResourcesToMatchingPrice,
	type Entitlement,
	type Feature,
	isFeatureItem,
	logEnts,
	logPrices,
	type Price,
	type Product,
	type ProductItem,
	prices,
} from "@autumn/shared";
import type { DrizzleCli } from "@server/db/initDrizzle.js";
import type { Logger } from "@server/external/logtail/logtailUtils.js";
import { FeatureService } from "@server/internal/features/FeatureService.js";
import {
	findBaseSlotReplacementPrice,
	findEntitlementFollowingFeature,
	findPriceFollowingEntitlementFeature,
} from "@server/internal/licenses/actions/links/licenseItemRepointMatchers.js";
import { licenseItemRepo } from "@server/internal/licenses/repos/licenseItemRepo.js";
import { EntitlementService } from "@server/internal/products/entitlements/EntitlementService.js";
import { PriceService } from "@server/internal/products/prices/PriceService.js";
import { itemToPriceAndEnt } from "@server/internal/products/product-items/productItemUtils/itemToPriceAndEnt.js";
import { validateProductItems } from "@server/internal/products/product-items/validateProductItems.js";
import { inArray } from "drizzle-orm";

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
	]);

	await repointLicenseItems({
		db,
		deletedEnts,
		deletedPrices,
		replacementEnts: [...newEnts, ...updatedEnts],
		replacementPrices: [...newPrices, ...updatedPrices],
	});
	await deletePricesKeepingLicenseReferenced({
		db,
		deletedPriceIds: deletedPrices.map((price) => price.id),
	});
	await deleteEntsKeepingReferenced({ db, deletedEnts });
};

/** A replaced base row's license item refs follow the replacement (matched
 * by feature; base price by the null-feature slot) so base edits propagate. */
const repointLicenseItems = async ({
	db,
	deletedEnts,
	deletedPrices,
	replacementEnts,
	replacementPrices,
}: {
	db: DrizzleCli;
	deletedEnts: Entitlement[];
	deletedPrices: Price[];
	replacementEnts: Entitlement[];
	replacementPrices: Price[];
}) => {
	const entitlementRefs = await licenseItemRepo.listRefsByEntitlementIds({
		db,
		entitlementIds: deletedEnts.map((ent) => ent.id),
	});
	for (const ref of entitlementRefs) {
		const previousEntitlement = deletedEnts.find(
			(ent) => ent.id === ref.entitlement_id,
		);
		const replacement = findEntitlementFollowingFeature({
			internalFeatureId: previousEntitlement?.internal_feature_id,
			replacementEntitlements: replacementEnts,
		});
		if (!replacement) continue;
		await licenseItemRepo.setEntitlementRef({
			db,
			refId: ref.id,
			entitlementId: replacement.id,
		});
	}

	const entitlementFeatureId = (entitlementId: string | null | undefined) => {
		if (!entitlementId) return null;
		const entitlement = [...deletedEnts, ...replacementEnts].find(
			(candidate) => candidate.id === entitlementId,
		);
		return entitlement?.internal_feature_id ?? null;
	};
	const priceRefs = await licenseItemRepo.listRefsByPriceIds({
		db,
		priceIds: deletedPrices.map((price) => price.id),
	});
	for (const ref of priceRefs) {
		const previousPrice = deletedPrices.find(
			(price) => price.id === ref.price_id,
		);
		const replacement = previousPrice?.entitlement_id
			? findPriceFollowingEntitlementFeature({
					internalFeatureId: entitlementFeatureId(previousPrice.entitlement_id),
					replacementPrices,
					featureInternalIdOfPrice: (price) =>
						entitlementFeatureId(price.entitlement_id),
				})
			: findBaseSlotReplacementPrice({ replacementPrices, previousPrice });
		if (!replacement) continue;
		await licenseItemRepo.setPriceRef({
			db,
			refId: ref.id,
			priceId: replacement.id,
		});
	}
};

/** Base rows still referenced by a license link are relabeled is_custom and
 * kept (grandfathered content), matching the customer-reference behavior. */
const deletePricesKeepingLicenseReferenced = async ({
	db,
	deletedPriceIds,
}: {
	db: DrizzleCli;
	deletedPriceIds: string[];
}) => {
	if (deletedPriceIds.length === 0) return;
	const referenced = await licenseItemRepo.listReferencedPriceIds({
		db,
		priceIds: deletedPriceIds,
	});

	const toRelabel = deletedPriceIds.filter((id) => referenced.has(id));
	const toDelete = deletedPriceIds.filter((id) => !referenced.has(id));
	if (toRelabel.length > 0) {
		await db
			.update(prices)
			.set({ is_custom: true })
			.where(inArray(prices.id, toRelabel));
	}
	if (toDelete.length > 0) {
		await PriceService.deleteInIds({ db, ids: toDelete });
	}
};

/** Deleted entitlements that a custom price or a license link still points at
 * are relabeled is_custom (kept as standalone rows) rather than deleted. */
const deleteEntsKeepingReferenced = async ({
	db,
	deletedEnts,
}: {
	db: DrizzleCli;
	deletedEnts: Entitlement[];
}) => {
	if (deletedEnts.length === 0) return;
	const deletedEntIds = deletedEnts.map((ent) => ent.id);
	const [customPrices, licenseReferencedEntIds] = await Promise.all([
		PriceService.getCustomInEntIds({ db, entitlementIds: deletedEntIds }),
		licenseItemRepo.listReferencedEntitlementIds({
			db,
			entitlementIds: deletedEntIds,
		}),
	]);

	if (customPrices.length === 0 && licenseReferencedEntIds.size === 0) {
		await EntitlementService.deleteInIds({ db, ids: deletedEntIds });
		return;
	}

	await Promise.all(
		deletedEnts.map((ent) => {
			const referenced =
				customPrices.some((price) => price.entitlement_id === ent.id) ||
				licenseReferencedEntIds.has(ent.id);
			return referenced
				? EntitlementService.update({
						db,
						id: ent.id,
						updates: { is_custom: true },
					})
				: EntitlementService.deleteInIds({ db, ids: [ent.id] });
		}),
	);
};

const handleCustomProductItems = ({
	newPrices,
	newEnts,
	updatedPrices,
	updatedEnts,
	samePrices,
	sameEnts,
	features,
}: {
	newPrices: Price[];
	newEnts: Entitlement[];
	updatedPrices: Price[];
	updatedEnts: Entitlement[];
	samePrices: Price[];
	sameEnts: Entitlement[];
	features: Feature[];
}) => ({
	prices: [...newPrices, ...updatedPrices, ...samePrices],
	entitlements: [...newEnts, ...updatedEnts, ...sameEnts].map((ent) => ({
		...ent,
		feature: features.find((f) => f.id === ent.feature_id),
	})),
	customPrices: [...newPrices, ...updatedPrices],
	customEnts: [...newEnts, ...updatedEnts],
	features,
});

const carryForwardStripeResources = ({
	targetPrices,
	targetEntitlements,
	candidatePrices,
	candidateEntitlements,
}: {
	targetPrices: Price[];
	targetEntitlements: Entitlement[];
	candidatePrices: Price[];
	candidateEntitlements: Entitlement[];
}) => {
	for (const targetPrice of targetPrices) {
		copyStripeResourcesToMatchingPrice({
			targetPrice,
			candidatePrices,
			targetEntitlements,
			candidateEntitlements,
		});
	}
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
	multiCurrencyEnabled,
}: {
	db: DrizzleCli;
	curPrices: Price[];
	curEnts: Entitlement[];
	newItems: ProductItem[];
	features: Feature[];
	product: Product;
	logger: Logger;
	isCustom: boolean;
	newVersion?: boolean;
	saveToDb?: boolean;
	multiCurrencyEnabled: boolean;
}) => {
	// Create features if not exist...
	if (!newItems) {
		return {
			prices: [],
			entitlements: [],
			customPrices: [],
			customEnts: [],
			features,
		};
	}

	// Validate product items...
	const { allFeatures, newFeatures } = validateProductItems({
		newItems,
		features,
		orgId: product.org_id!,
		env: product.env as AppEnv,
		multiCurrencyEnabled,
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

	carryForwardStripeResources({
		targetPrices: [...newPrices, ...updatedPrices],
		targetEntitlements: [...newEnts, ...updatedEnts, ...sameEnts],
		candidatePrices: curPrices,
		candidateEntitlements: curEnts,
	});

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
		features,
	};
};
