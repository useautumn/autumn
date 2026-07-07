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

type MemberRows = {
	entitlements: (DbEntitlement & { plan_license_id: string })[];
	prices: (DbPrice & { plan_license_id: string })[];
};

/** A link's member rows: the mix of live base rows and is_custom overrides. */
const listMemberRows = async ({
	db,
	planLicenseIds,
}: {
	db: DrizzleCli;
	planLicenseIds: string[];
}): Promise<MemberRows> => {
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
 * Replace-set a link's membership: new junctions in, old junctions out, then
 * formerly-referenced is_custom rows are swept when nothing (no link, no
 * customer) references them. Callers wrap in a transaction.
 */
const replaceMemberships = async ({
	db,
	planLicenseId,
	entitlementIds,
	priceIds,
}: {
	db: DrizzleCli;
	planLicenseId: string;
	entitlementIds: string[];
	priceIds: string[];
}) => {
	const now = Date.now();
	const previous = await listMemberRows({
		db,
		planLicenseIds: [planLicenseId],
	});

	await db
		.delete(licenseEntitlements)
		.where(eq(licenseEntitlements.plan_license_id, planLicenseId));
	await db
		.delete(licensePrices)
		.where(eq(licensePrices.plan_license_id, planLicenseId));

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

/** Version copies share rows — membership is copied, content is not cloned. */
const cloneMemberships = async ({
	db,
	fromPlanLicenseId,
	toPlanLicenseId,
}: {
	db: DrizzleCli;
	fromPlanLicenseId: string;
	toPlanLicenseId: string;
}) => {
	const existing = await listMemberRows({
		db,
		planLicenseIds: [fromPlanLicenseId],
	});
	await replaceMemberships({
		db,
		planLicenseId: toPlanLicenseId,
		entitlementIds: existing.entitlements.map((row) => row.id),
		priceIds: existing.prices.map((row) => row.id),
	});
};

export const licenseContentRepo = {
	listMemberRows,
	replaceMemberships,
	cloneMemberships,
} as const;
