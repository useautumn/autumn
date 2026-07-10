import {
	CusProductStatus,
	customerLicenses,
	customerProducts,
	entitlements,
	type FullProduct,
	planLicenses,
	prices,
} from "@autumn/shared";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getFullLicenseProduct } from "../../licenseUtils.js";
import { licenseItemRepo } from "../../repos/licenseItemRepo.js";
import { planLicenseRepo } from "../../repos/planLicenseRepo.js";
import {
	findBaseSlotReplacementPrice,
	findEntitlementFollowingFeature,
	findPriceFollowingEntitlementFeature,
} from "./licenseItemRepointMatchers.js";
import { validateLicenseLink } from "./validateLicenseLink.js";

type EntitlementRow = typeof entitlements.$inferSelect;
type PriceRow = typeof prices.$inferSelect;
type ItemRef<Row> = { refId: string; row: Row };

/** Re-points base entitlement refs onto the new version's entitlement sharing
 * the same feature; unmatched refs stay grandfathered on the old version. */
const repointEntitlementBaseRefs = async ({
	tx,
	itemEntitlements,
	newEntitlements,
}: {
	tx: DrizzleCli;
	itemEntitlements: ItemRef<EntitlementRow>[];
	newEntitlements: EntitlementRow[];
}) => {
	for (const { refId, row } of itemEntitlements) {
		if (row.is_custom) continue;
		const replacement = findEntitlementFollowingFeature({
			internalFeatureId: row.internal_feature_id,
			replacementEntitlements: newEntitlements,
		});
		if (!replacement) continue;
		await licenseItemRepo.setEntitlementRef({
			db: tx,
			refId,
			entitlementId: replacement.id,
		});
	}
};

/** Re-points base price refs onto the new version: a feature-linked price
 * follows its entitlement's feature; a base-slot price matches by config. */
const repointPriceBaseRefs = async ({
	tx,
	itemPrices,
	newPrices,
	oldEntitlementById,
	newEntitlementById,
}: {
	tx: DrizzleCli;
	itemPrices: ItemRef<PriceRow>[];
	newPrices: PriceRow[];
	oldEntitlementById: Map<string, EntitlementRow>;
	newEntitlementById: Map<string, EntitlementRow>;
}) => {
	const featureIdOfNewPrice = (price: PriceRow) =>
		price.entitlement_id
			? newEntitlementById.get(price.entitlement_id)?.internal_feature_id
			: null;

	for (const { refId, row } of itemPrices) {
		if (row.is_custom) continue;
		const previousEntitlement = row.entitlement_id
			? oldEntitlementById.get(row.entitlement_id)
			: undefined;
		const replacement = previousEntitlement
			? findPriceFollowingEntitlementFeature({
					internalFeatureId: previousEntitlement.internal_feature_id,
					replacementPrices: newPrices,
					featureInternalIdOfPrice: featureIdOfNewPrice,
				})
			: findBaseSlotReplacementPrice({
					replacementPrices: newPrices,
					previousPrice: row,
				});
		if (!replacement) continue;
		await licenseItemRepo.setPriceRef({
			db: tx,
			refId,
			priceId: replacement.id,
		});
	}
};

/** Custom item rows move to the new version; base-row item refs re-point to
 * the new version's matching rows by feature, unmatched refs stay grandfathered. */
const rollForwardItems = async ({
	tx,
	fromInternalProductId,
	toInternalProductId,
}: {
	tx: DrizzleCli;
	fromInternalProductId: string;
	toInternalProductId: string;
}) => {
	const { entitlements: itemEntitlements, prices: itemPrices } =
		await licenseItemRepo.listItemRefsByInternalProductId({
			db: tx,
			internalProductId: fromInternalProductId,
		});
	if (itemEntitlements.length === 0 && itemPrices.length === 0) return;

	// Custom rows belong to a single version, so they move wholesale to the new
	// one; base rows are shared and get re-pointed by feature below.
	const customEntitlementIds = itemEntitlements
		.filter(({ row }) => row.is_custom)
		.map(({ row }) => row.id);
	if (customEntitlementIds.length > 0) {
		await tx
			.update(entitlements)
			.set({ internal_product_id: toInternalProductId })
			.where(inArray(entitlements.id, customEntitlementIds));
	}
	const customPriceIds = itemPrices
		.filter(({ row }) => row.is_custom)
		.map(({ row }) => row.id);
	if (customPriceIds.length > 0) {
		await tx
			.update(prices)
			.set({ internal_product_id: toInternalProductId })
			.where(inArray(prices.id, customPriceIds));
	}

	const { entitlements: newEntitlements, prices: newPrices } =
		await licenseItemRepo.listBaseRowsByInternalProductId({
			db: tx,
			internalProductId: toInternalProductId,
		});
	const newEntitlementById = new Map(
		newEntitlements.map((row) => [row.id, row]),
	);
	const oldEntitlementById = new Map(
		itemEntitlements.map(({ row }) => [row.id, row]),
	);

	await repointEntitlementBaseRefs({ tx, itemEntitlements, newEntitlements });
	await repointPriceBaseRefs({
		tx,
		itemPrices,
		newPrices,
		oldEntitlementById,
		newEntitlementById,
	});
};

/** Every parent linking to this license must still satisfy the link rules
 * against `newLicenseProduct`, or versioning is rejected. Pure check — no
 * writes — so it can run before the new license version is persisted. */
export const validateRolledForwardLicenses = async ({
	ctx,
	fromInternalProductId,
	newLicenseProduct,
}: {
	ctx: AutumnContext;
	fromInternalProductId: string;
	newLicenseProduct: FullProduct;
}) => {
	const links = await planLicenseRepo.listCatalogByLicenseInternalProductIds({
		db: ctx.db,
		licenseInternalProductIds: [fromInternalProductId],
	});
	const parentProducts = await Promise.all(
		links.map((link) =>
			getFullLicenseProduct({
				ctx,
				idOrInternalId: link.parent_internal_product_id,
			}),
		),
	);
	links.forEach((link, index) => {
		validateLicenseLink({
			parentProduct: parentProducts[index],
			licenseProduct: newLicenseProduct,
			prepaidOnly: link.prepaid_only,
			licensePlanId: newLicenseProduct.id,
		});
	});
};

/** Repoints existing catalog links + live assignments onto the new license
 * version. Assumes validateRolledForwardLicenses already passed. */
export const rollForwardLicenseProductVersion = async ({
	ctx,
	fromInternalProductId,
	toInternalProductId,
}: {
	ctx: AutumnContext;
	fromInternalProductId: string;
	toInternalProductId: string;
}) => {
	await ctx.db.transaction(async (tx) => {
		await tx
			.update(planLicenses)
			.set({ license_internal_product_id: toInternalProductId })
			.where(
				eq(planLicenses.license_internal_product_id, fromInternalProductId),
			);
		await tx
			.update(customerLicenses)
			.set({ license_internal_product_id: toInternalProductId })
			.where(
				eq(customerLicenses.license_internal_product_id, fromInternalProductId),
			);
		await tx
			.update(customerProducts)
			.set({ internal_product_id: toInternalProductId })
			.where(
				and(
					eq(customerProducts.internal_product_id, fromInternalProductId),
					isNotNull(customerProducts.license_parent_customer_product_id),
					isNotNull(customerProducts.internal_entity_id),
					inArray(customerProducts.status, [
						CusProductStatus.Active,
						CusProductStatus.PastDue,
						CusProductStatus.Trialing,
					]),
				),
			);
		await rollForwardItems({
			tx: tx as unknown as DrizzleCli,
			fromInternalProductId,
			toInternalProductId,
		});
	});
};
