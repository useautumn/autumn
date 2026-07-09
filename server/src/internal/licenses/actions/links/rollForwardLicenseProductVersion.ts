import {
	CusProductStatus,
	customerLicenses,
	customerProducts,
	entitlements,
	licenseEntitlements,
	licensePrices,
	planLicenses,
	prices,
} from "@autumn/shared";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import {
	findBaseSlotReplacementPrice,
	findEntitlementFollowingFeature,
	findPriceFollowingEntitlementFeature,
} from "./licenseItemRepointMatchers.js";

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
	const itemEntitlements = await tx
		.select({ refId: licenseEntitlements.id, row: entitlements })
		.from(licenseEntitlements)
		.innerJoin(
			entitlements,
			eq(entitlements.id, licenseEntitlements.entitlement_id),
		)
		.where(eq(entitlements.internal_product_id, fromInternalProductId));
	const itemPrices = await tx
		.select({ refId: licensePrices.id, row: prices })
		.from(licensePrices)
		.innerJoin(prices, eq(prices.id, licensePrices.price_id))
		.where(eq(prices.internal_product_id, fromInternalProductId));
	if (itemEntitlements.length === 0 && itemPrices.length === 0) return;

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

	const [newEntitlements, newPrices] = await Promise.all([
		tx
			.select()
			.from(entitlements)
			.where(
				and(
					eq(entitlements.internal_product_id, toInternalProductId),
					eq(entitlements.is_custom, false),
				),
			),
		tx
			.select()
			.from(prices)
			.where(
				and(
					eq(prices.internal_product_id, toInternalProductId),
					eq(prices.is_custom, false),
				),
			),
	]);
	const newEntitlementById = new Map(
		newEntitlements.map((row) => [row.id, row]),
	);
	const oldEntitlementById = new Map(
		itemEntitlements.map(({ row }) => [row.id, row]),
	);

	for (const { refId, row } of itemEntitlements) {
		if (row.is_custom) continue;
		const replacement = findEntitlementFollowingFeature({
			internalFeatureId: row.internal_feature_id,
			replacementEntitlements: newEntitlements,
		});
		if (!replacement) continue;
		await tx
			.update(licenseEntitlements)
			.set({ entitlement_id: replacement.id })
			.where(eq(licenseEntitlements.id, refId));
	}
	for (const { refId, row } of itemPrices) {
		if (row.is_custom) continue;
		const previousEntitlement = row.entitlement_id
			? oldEntitlementById.get(row.entitlement_id)
			: undefined;
		const replacement = previousEntitlement
			? findPriceFollowingEntitlementFeature({
					internalFeatureId: previousEntitlement.internal_feature_id,
					replacementPrices: newPrices,
					featureInternalIdOfPrice: (candidate) =>
						candidate.entitlement_id
							? newEntitlementById.get(candidate.entitlement_id)
									?.internal_feature_id
							: null,
				})
			: findBaseSlotReplacementPrice({ replacementPrices: newPrices });
		if (!replacement) continue;
		await tx
			.update(licensePrices)
			.set({ price_id: replacement.id })
			.where(eq(licensePrices.id, refId));
	}
};

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
