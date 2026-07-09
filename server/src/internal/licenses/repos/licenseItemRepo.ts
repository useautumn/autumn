import {
	customerEntitlements,
	customerPrices,
	type DbEntitlement,
	type DbPrice,
	entitlements,
	licenseEntitlements,
	licensePrices,
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
	const [entitlementRows, priceRows] = await Promise.all([
		db
			.select({
				row: entitlements,
				plan_license_id: licenseEntitlements.plan_license_id,
			})
			.from(licenseEntitlements)
			.innerJoin(
				entitlements,
				eq(entitlements.id, licenseEntitlements.entitlement_id),
			)
			.where(inArray(licenseEntitlements.plan_license_id, planLicenseIds)),
		db
			.select({
				row: prices,
				plan_license_id: licensePrices.plan_license_id,
			})
			.from(licensePrices)
			.innerJoin(prices, eq(prices.id, licensePrices.price_id))
			.where(inArray(licensePrices.plan_license_id, planLicenseIds)),
	]);
	return {
		entitlements: entitlementRows.map(({ row, plan_license_id }) => ({
			...row,
			plan_license_id,
		})),
		prices: priceRows.map(({ row, plan_license_id }) => ({
			...row,
			plan_license_id,
		})),
	};
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
							.select({ id: licensePrices.id })
							.from(licensePrices)
							.where(eq(licensePrices.price_id, prices.id)),
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
							.select({ id: licenseEntitlements.id })
							.from(licenseEntitlements)
							.where(eq(licenseEntitlements.entitlement_id, entitlements.id)),
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
		.delete(licenseEntitlements)
		.where(eq(licenseEntitlements.plan_license_id, planLicenseId));
	await db
		.delete(licensePrices)
		.where(eq(licensePrices.plan_license_id, planLicenseId));

	const entitlementIds = [
		...new Set(
			items
				.map((item) => item.entitlementId)
				.filter((id): id is string => Boolean(id)),
		),
	];
	const priceIds = [
		...new Set(
			items
				.map((item) => item.priceId)
				.filter((id): id is string => Boolean(id)),
		),
	];
	if (entitlementIds.length > 0) {
		await db.insert(licenseEntitlements).values(
			entitlementIds.map((entitlementId) => ({
				id: generateId("lic_ent"),
				plan_license_id: planLicenseId,
				entitlement_id: entitlementId,
				created_at: now,
			})),
		);
	}
	if (priceIds.length > 0) {
		await db.insert(licensePrices).values(
			priceIds.map((priceId) => ({
				id: generateId("lic_pr"),
				plan_license_id: planLicenseId,
				price_id: priceId,
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
		.from(licenseEntitlements)
		.where(inArray(licenseEntitlements.entitlement_id, entitlementIds));
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
		.from(licensePrices)
		.where(inArray(licensePrices.price_id, priceIds));
};

const setEntitlementRef = async ({
	db,
	refId,
	entitlementId,
}: {
	db: DrizzleCli;
	refId: string;
	entitlementId: string;
}) => {
	await db
		.update(licenseEntitlements)
		.set({ entitlement_id: entitlementId })
		.where(eq(licenseEntitlements.id, refId));
};

const setPriceRef = async ({
	db,
	refId,
	priceId,
}: {
	db: DrizzleCli;
	refId: string;
	priceId: string;
}) => {
	await db
		.update(licensePrices)
		.set({ price_id: priceId })
		.where(eq(licensePrices.id, refId));
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
		.select({ entitlement_id: licenseEntitlements.entitlement_id })
		.from(licenseEntitlements)
		.where(inArray(licenseEntitlements.entitlement_id, entitlementIds));
	return new Set(rows.map((row) => row.entitlement_id));
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
		.select({ price_id: licensePrices.price_id })
		.from(licensePrices)
		.where(inArray(licensePrices.price_id, priceIds));
	return new Set(rows.map((row) => row.price_id));
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
	const existing = await listByPlanLicenseIds({
		db,
		planLicenseIds: [fromPlanLicenseId],
	});
	// Idempotent for version-copy retries: the target link's refs are replaced.
	await db
		.delete(licenseEntitlements)
		.where(eq(licenseEntitlements.plan_license_id, toPlanLicenseId));
	await db
		.delete(licensePrices)
		.where(eq(licensePrices.plan_license_id, toPlanLicenseId));
	const now = Date.now();
	if (existing.entitlements.length > 0) {
		await db.insert(licenseEntitlements).values(
			existing.entitlements.map((row) => ({
				id: generateId("lic_ent"),
				plan_license_id: toPlanLicenseId,
				entitlement_id: row.id,
				created_at: now,
			})),
		);
	}
	if (existing.prices.length > 0) {
		await db.insert(licensePrices).values(
			existing.prices.map((row) => ({
				id: generateId("lic_pr"),
				plan_license_id: toPlanLicenseId,
				price_id: row.id,
				created_at: now,
			})),
		);
	}
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
