import {
	customerEntitlements,
	customerPrices,
	type DbEntitlement,
	type DbPrice,
	entitlements,
	licenseItems,
	prices,
} from "@autumn/shared";
import { and, eq, inArray, notExists } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { generateId } from "@/utils/genUtils.js";

export type LicenseItemRows = {
	entitlements: (DbEntitlement & { plan_license_id: string })[];
	prices: (DbPrice & { plan_license_id: string })[];
};

type LicenseItemPair = {
	entitlementId?: string;
	priceId?: string;
};

/** A link's item rows: the mix of live base rows and is_custom overrides. */
const listByPlanLicenseIds = async ({
	db,
	planLicenseIds,
}: {
	db: DrizzleCli;
	planLicenseIds: string[];
}): Promise<LicenseItemRows> => {
	if (planLicenseIds.length === 0) return { entitlements: [], prices: [] };
	const rows = await db
		.select({
			plan_license_id: licenseItems.plan_license_id,
			entitlement: entitlements,
			price: prices,
		})
		.from(licenseItems)
		.leftJoin(entitlements, eq(entitlements.id, licenseItems.entitlement_id))
		.leftJoin(prices, eq(prices.id, licenseItems.price_id))
		.where(inArray(licenseItems.plan_license_id, planLicenseIds));

	const entitlementRows: LicenseItemRows["entitlements"] = [];
	const priceRows: LicenseItemRows["prices"] = [];
	const seenEntitlements = new Set<string>();
	const seenPrices = new Set<string>();
	for (const { plan_license_id, entitlement, price } of rows) {
		if (entitlement) {
			const key = `${plan_license_id}:${entitlement.id}`;
			if (!seenEntitlements.has(key)) {
				seenEntitlements.add(key);
				entitlementRows.push({ ...entitlement, plan_license_id });
			}
		}
		if (price) {
			const key = `${plan_license_id}:${price.id}`;
			if (!seenPrices.has(key)) {
				seenPrices.add(key);
				priceRows.push({ ...price, plan_license_id });
			}
		}
	}
	return { entitlements: entitlementRows, prices: priceRows };
};

const sweepUnreferencedCustomRows = async ({
	db,
	entitlementIds,
	priceIds,
}: {
	db: DrizzleCli;
	entitlementIds: string[];
	priceIds: string[];
}) => {
	if (priceIds.length > 0) {
		await db
			.delete(prices)
			.where(
				and(
					inArray(prices.id, priceIds),
					eq(prices.is_custom, true),
					notExists(
						db
							.select({ id: licenseItems.id })
							.from(licenseItems)
							.where(eq(licenseItems.price_id, prices.id)),
					),
					notExists(
						db
							.select({ id: customerPrices.id })
							.from(customerPrices)
							.where(eq(customerPrices.price_id, prices.id)),
					),
				),
			);
	}
	if (entitlementIds.length > 0) {
		await db
			.delete(entitlements)
			.where(
				and(
					inArray(entitlements.id, entitlementIds),
					eq(entitlements.is_custom, true),
					notExists(
						db
							.select({ id: licenseItems.id })
							.from(licenseItems)
							.where(eq(licenseItems.entitlement_id, entitlements.id)),
					),
					notExists(
						db
							.select({ id: customerEntitlements.id })
							.from(customerEntitlements)
							.where(eq(customerEntitlements.entitlement_id, entitlements.id)),
					),
				),
			);
	}
};

/**
 * Replace-set a link's items: new rows in, old rows out, then
 * formerly-referenced is_custom rows are swept when nothing (no link, no
 * customer) references them. Callers wrap in a transaction.
 */
const replaceItems = async ({
	db,
	planLicenseId,
	items,
}: {
	db: DrizzleCli;
	planLicenseId: string;
	items: LicenseItemPair[];
}) => {
	const now = Date.now();
	const previous = await listByPlanLicenseIds({
		db,
		planLicenseIds: [planLicenseId],
	});

	await db
		.delete(licenseItems)
		.where(eq(licenseItems.plan_license_id, planLicenseId));

	const validItems = items.filter((item) => item.entitlementId || item.priceId);
	if (validItems.length > 0) {
		await db.insert(licenseItems).values(
			validItems.map((item) => ({
				id: generateId("lic_item"),
				plan_license_id: planLicenseId,
				entitlement_id: item.entitlementId ?? null,
				price_id: item.priceId ?? null,
				created_at: now,
			})),
		);
	}

	await sweepUnreferencedCustomRows({
		db,
		entitlementIds: previous.entitlements.map((row) => row.id),
		priceIds: previous.prices.map((row) => row.id),
	});
};

const listRefsByEntitlementIds = async ({
	db,
	entitlementIds,
}: {
	db: DrizzleCli;
	entitlementIds: string[];
}) => {
	if (entitlementIds.length === 0) return [];
	return await db
		.select()
		.from(licenseItems)
		.where(inArray(licenseItems.entitlement_id, entitlementIds));
};

const listRefsByPriceIds = async ({
	db,
	priceIds,
}: {
	db: DrizzleCli;
	priceIds: string[];
}) => {
	if (priceIds.length === 0) return [];
	return await db
		.select()
		.from(licenseItems)
		.where(inArray(licenseItems.price_id, priceIds));
};

const setEntitlementRef = async ({
	db,
	licenseItemId,
	entitlementId,
}: {
	db: DrizzleCli;
	licenseItemId: string;
	entitlementId: string;
}) => {
	await db
		.update(licenseItems)
		.set({ entitlement_id: entitlementId })
		.where(eq(licenseItems.id, licenseItemId));
};

const setPriceRef = async ({
	db,
	licenseItemId,
	priceId,
}: {
	db: DrizzleCli;
	licenseItemId: string;
	priceId: string;
}) => {
	await db
		.update(licenseItems)
		.set({ price_id: priceId })
		.where(eq(licenseItems.id, licenseItemId));
};

const listReferencedEntitlementIds = async ({
	db,
	entitlementIds,
}: {
	db: DrizzleCli;
	entitlementIds: string[];
}): Promise<Set<string>> => {
	if (entitlementIds.length === 0) return new Set();
	const rows = await db
		.select({ entitlement_id: licenseItems.entitlement_id })
		.from(licenseItems)
		.where(inArray(licenseItems.entitlement_id, entitlementIds));
	return new Set(
		rows
			.map((row) => row.entitlement_id)
			.filter((id): id is string => id !== null),
	);
};

const listReferencedPriceIds = async ({
	db,
	priceIds,
}: {
	db: DrizzleCli;
	priceIds: string[];
}): Promise<Set<string>> => {
	if (priceIds.length === 0) return new Set();
	const rows = await db
		.select({ price_id: licenseItems.price_id })
		.from(licenseItems)
		.where(inArray(licenseItems.price_id, priceIds));
	return new Set(
		rows.map((row) => row.price_id).filter((id): id is string => id !== null),
	);
};

/** Version copies share rows — item refs are copied, underlying rows are not cloned. */
const cloneItems = async ({
	db,
	fromPlanLicenseId,
	toPlanLicenseId,
}: {
	db: DrizzleCli;
	fromPlanLicenseId: string;
	toPlanLicenseId: string;
}) => {
	const existing = await db
		.select()
		.from(licenseItems)
		.where(eq(licenseItems.plan_license_id, fromPlanLicenseId));
	if (existing.length === 0) return;
	const now = Date.now();
	await db.insert(licenseItems).values(
		existing.map((row) => ({
			id: generateId("lic_item"),
			plan_license_id: toPlanLicenseId,
			entitlement_id: row.entitlement_id,
			price_id: row.price_id,
			created_at: now,
		})),
	);
};

export const licenseItemRepo = {
	listByPlanLicenseIds,
	replaceItems,
	cloneItems,
	listRefsByEntitlementIds,
	listRefsByPriceIds,
	setEntitlementRef,
	setPriceRef,
	listReferencedEntitlementIds,
	listReferencedPriceIds,
} as const;
