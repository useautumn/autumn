import {
	type Entitlement,
	enrichEntitlementWithFeature,
	type FullCustomer,
	type FullProduct,
	type ProductItem,
	type ProductItemInterval,
} from "@autumn/shared";
import { TransactionRollbackError } from "drizzle-orm";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { initCustomerEntitlement } from "@/internal/billing/v2/utils/initFullCustomerProduct/initCustomerEntitlement/initCustomerEntitlement.js";
import { initCustomerEntitlementNextResetAt } from "@/internal/billing/v2/utils/initFullCustomerProduct/initCustomerEntitlement/initCustomerEntitlementNextResetAt.js";
import { CusService } from "@/internal/customers/CusService.js";
import { CusEntService } from "@/internal/customers/cusProducts/cusEnts/CusEntitlementService.js";
import { deleteCachedFullCustomer } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/deleteCachedFullCustomer.js";
import { EntitlementService } from "@/internal/products/entitlements/EntitlementService.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { toFeature } from "@/internal/products/product-items/productItemUtils/itemToPriceAndEnt.js";
import { generateId } from "@/utils/genUtils.js";
import { getPaidQuantity, isLicensePoolParentStatus } from "../licenseUtils.js";
import {
	licenseAssignmentRepo,
	licensePoolGrantRepo,
	licensePoolRepo,
} from "../repos/index.js";
import { computePooledGrantTransition } from "./pooledGrantMath.js";

type PooledDesired = {
	licenseInternalProductId: string;
	featureId: string;
	desired: number;
	resetInterval: string | null;
	resetIntervalCount: number;
};

const effectivePooledItem = ({
	definition,
	licenseProduct,
	featureId,
}: {
	definition: {
		pooled_feature_ids: string[];
		customize: {
			items: {
				feature_id: string;
				included?: number;
				reset?: { interval: string; interval_count?: number };
			}[];
		} | null;
	};
	licenseProduct: FullProduct | undefined;
	featureId: string;
}): {
	allowance: number;
	resetInterval: string | null;
	resetIntervalCount: number;
} | null => {
	const customizeItem = definition.customize?.items.find(
		(item) => item.feature_id === featureId,
	);
	if (customizeItem) {
		if (!customizeItem.included || customizeItem.included <= 0) return null;
		return {
			allowance: customizeItem.included,
			resetInterval: customizeItem.reset?.interval ?? null,
			resetIntervalCount: customizeItem.reset?.interval_count ?? 1,
		};
	}

	const entitlement = licenseProduct?.entitlements.find(
		(candidate) => candidate.feature.id === featureId,
	);
	if (!entitlement?.allowance || entitlement.allowance <= 0) return null;
	return {
		allowance: entitlement.allowance,
		resetInterval: entitlement.interval ?? null,
		resetIntervalCount: entitlement.interval_count ?? 1,
	};
};

const loadDesiredPooledGrants = async ({
	ctx,
	fullCustomer,
}: {
	ctx: AutumnContext;
	fullCustomer: FullCustomer;
}): Promise<PooledDesired[]> => {
	const poolRows = await licensePoolRepo.listPoolRowsByCustomer({
		db: ctx.db,
		orgId: ctx.org.id,
		env: ctx.env,
		internalCustomerId: fullCustomer.internal_id,
	});

	const activeRows = poolRows.filter(({ parentCustomerProduct }) =>
		isLicensePoolParentStatus({ status: parentCustomerProduct.status }),
	);

	const pooledLicenseInternalIds = [
		...new Set(
			activeRows
				.filter(({ planLicense, customerProductLicense }) => {
					const definition = planLicense ?? customerProductLicense;
					return (definition?.pooled_feature_ids?.length ?? 0) > 0;
				})
				.map(({ pool }) => pool.license_internal_product_id),
		),
	];
	const licenseProducts = await Promise.all(
		pooledLicenseInternalIds.map((internalId) =>
			ProductService.getFull({
				db: ctx.db,
				idOrInternalId: internalId,
				orgId: ctx.org.id,
				env: ctx.env,
			}),
		),
	);
	const licenseProductByInternalId = new Map(
		licenseProducts.map((product) => [product.internal_id, product]),
	);

	const desiredByKey = new Map<string, PooledDesired>();
	for (const row of activeRows) {
		const definition = row.planLicense ?? row.customerProductLicense;
		if (!definition || definition.pooled_feature_ids.length === 0) continue;

		const capacity =
			definition.included_quantity +
			getPaidQuantity({ customerProduct: row.paidCustomerProduct });
		if (capacity <= 0) continue;

		for (const featureId of definition.pooled_feature_ids) {
			const item = effectivePooledItem({
				definition,
				licenseProduct: licenseProductByInternalId.get(
					row.pool.license_internal_product_id,
				),
				featureId,
			});
			if (!item) continue;

			const key = `${row.pool.license_internal_product_id}:${featureId}`;
			const existing = desiredByKey.get(key) ?? {
				licenseInternalProductId: row.pool.license_internal_product_id,
				featureId,
				desired: 0,
				resetInterval: item.resetInterval,
				resetIntervalCount: item.resetIntervalCount,
			};
			existing.desired += item.allowance * capacity;
			desiredByKey.set(key, existing);
		}
	}

	return [...desiredByKey.values()];
};

const createPooledGrant = async ({
	ctx,
	fullCustomer,
	desired,
}: {
	ctx: AutumnContext;
	fullCustomer: FullCustomer;
	desired: PooledDesired;
}) => {
	const feature = ctx.features.find(
		(candidate) => candidate.id === desired.featureId,
	);
	if (!feature) return;

	const grantItem: ProductItem = {
		feature_id: desired.featureId,
		included_usage: desired.desired,
		interval: (desired.resetInterval ?? null) as ProductItemInterval | null,
		interval_count: desired.resetIntervalCount,
	};
	const { ent: grantEntitlement } = toFeature({
		item: grantItem,
		orgId: ctx.org.id,
		isCustom: true,
		internalFeatureId: feature.internal_id,
	});
	const now = Date.now();
	const grantCustomerEntitlement = initCustomerEntitlement({
		initContext: {
			fullCustomer,
			featureQuantities: [],
			resetCycleAnchor: now,
			freeTrial: null,
			now,
		},
		entitlement: enrichEntitlementWithFeature({
			entitlement: grantEntitlement,
			feature,
		}),
		cusProductId: null,
	});

	await ctx.db
		.transaction(async (tx) => {
			const txCtx = { ...ctx, db: tx as unknown as typeof ctx.db };
			await EntitlementService.insert({
				db: txCtx.db,
				data: [grantEntitlement],
			});
			await CusEntService.insert({
				ctx: txCtx,
				data: [grantCustomerEntitlement],
			});
			const inserted = await licensePoolGrantRepo.insertIgnoringDuplicate({
				db: txCtx.db,
				grant: {
					id: generateId("lic_grant"),
					org_id: ctx.org.id,
					env: ctx.env,
					internal_customer_id: fullCustomer.internal_id,
					license_internal_product_id: desired.licenseInternalProductId,
					internal_feature_id: feature.internal_id,
					entitlement_id: grantEntitlement.id,
					customer_entitlement_id: grantCustomerEntitlement.id,
					period_granted_allowance: desired.desired,
					period_key: grantCustomerEntitlement.next_reset_at ?? null,
					created_at: now,
					updated_at: now,
				},
			});

			// A concurrent reconcile won the natural key: roll back our ent + cusEnt.
			if (!inserted) tx.rollback();
		})
		.catch((error) => {
			if (error instanceof TransactionRollbackError) return;
			throw error;
		});
};

const applyPooledGrantTransition = async ({
	ctx,
	fullCustomer,
	desired,
}: {
	ctx: AutumnContext;
	fullCustomer: FullCustomer;
	desired: PooledDesired;
}) => {
	const feature = ctx.features.find(
		(candidate) => candidate.id === desired.featureId,
	);
	if (!feature) return;

	await ctx.db.transaction(async (tx) => {
		const txCtx = { ...ctx, db: tx as unknown as typeof ctx.db };
		const grant = await licensePoolGrantRepo.getForUpdateByNaturalKey({
			db: txCtx.db,
			orgId: ctx.org.id,
			env: ctx.env,
			internalCustomerId: fullCustomer.internal_id,
			licenseInternalProductId: desired.licenseInternalProductId,
			internalFeatureId: feature.internal_id,
		});

		if (!grant) return;

		const customerEntitlement =
			await licensePoolGrantRepo.getCustomerEntitlementById({
				db: txCtx.db,
				customerEntitlementId: grant.customer_entitlement_id,
			});
		const entitlementRow = await licensePoolGrantRepo.getEntitlementById({
			db: txCtx.db,
			entitlementId: grant.entitlement_id,
		});
		if (!customerEntitlement || !entitlementRow) return;

		const now = Date.now();
		const transition = computePooledGrantTransition({
			desired: desired.desired,
			periodGrantedAllowance: grant.period_granted_allowance,
			periodKey: grant.period_key,
			currentAllowance: entitlementRow.allowance ?? 0,
			nextResetAt: customerEntitlement.next_reset_at,
			expiresAt: customerEntitlement.expires_at,
			now,
		});

		const customerEntitlementUpdates: Record<string, unknown> = {};
		if (transition.expireNow) customerEntitlementUpdates.expires_at = now;
		if (transition.restore) customerEntitlementUpdates.expires_at = null;
		if (transition.resetBalanceTo !== null) {
			customerEntitlementUpdates.balance = transition.resetBalanceTo;
		}

		let nextPeriodKey = transition.periodKey;
		if (transition.reanchorReset) {
			const nextResetAt = initCustomerEntitlementNextResetAt({
				initContext: {
					fullCustomer,
					featureQuantities: [],
					resetCycleAnchor: now,
					freeTrial: null,
					now,
				},
				entitlement: enrichEntitlementWithFeature({
					entitlement: { ...entitlementRow, is_custom: true } as Entitlement,
					feature,
				}),
			});
			customerEntitlementUpdates.next_reset_at = nextResetAt;
			nextPeriodKey = nextResetAt ?? null;
		}

		if (Object.keys(customerEntitlementUpdates).length > 0) {
			await CusEntService.update({
				ctx: txCtx,
				id: customerEntitlement.id,
				updates: customerEntitlementUpdates,
				incrementCacheVersion: true,
			});
		}
		if (transition.balanceDelta > 0) {
			await CusEntService.increment({
				ctx: txCtx,
				id: customerEntitlement.id,
				amount: transition.balanceDelta,
			});
		}
		if ((entitlementRow.allowance ?? 0) !== transition.allowance) {
			await EntitlementService.update({
				db: tx as unknown as typeof ctx.db,
				id: entitlementRow.id,
				updates: { allowance: transition.allowance },
			});
		}
		await licensePoolGrantRepo.updatePeriodMarker({
			db: txCtx.db,
			grantId: grant.id,
			periodGrantedAllowance: transition.periodGrantedAllowance,
			periodKey: nextPeriodKey,
			updatedAt: now,
		});
	});
};

export const reconcilePooledGrantsForCustomer = async ({
	ctx,
	customerId,
}: {
	ctx: AutumnContext;
	customerId: string;
}) => {
	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});
	const desiredGrants = await loadDesiredPooledGrants({ ctx, fullCustomer });
	const existingGrants = await licensePoolGrantRepo.listByCustomer({
		db: ctx.db,
		orgId: ctx.org.id,
		env: ctx.env,
		internalCustomerId: fullCustomer.internal_id,
	});
	if (desiredGrants.length === 0 && existingGrants.length === 0) return;

	const desiredByKey = new Map(
		desiredGrants.map((desired) => [
			`${desired.licenseInternalProductId}:${desired.featureId}`,
			desired,
		]),
	);
	const featureIdByInternalId = new Map(
		ctx.features.map((feature) => [feature.internal_id, feature.id]),
	);
	const existingKeys = new Set(
		existingGrants.map(
			(grant) =>
				`${grant.license_internal_product_id}:${featureIdByInternalId.get(grant.internal_feature_id)}`,
		),
	);

	for (const desired of desiredGrants) {
		const key = `${desired.licenseInternalProductId}:${desired.featureId}`;
		if (!existingKeys.has(key)) {
			await createPooledGrant({ ctx, fullCustomer, desired });
			continue;
		}
		await applyPooledGrantTransition({ ctx, fullCustomer, desired });
	}

	for (const grant of existingGrants) {
		const featureId = featureIdByInternalId.get(grant.internal_feature_id);
		if (!featureId) continue;
		const key = `${grant.license_internal_product_id}:${featureId}`;
		if (desiredByKey.has(key)) continue;
		await applyPooledGrantTransition({
			ctx,
			fullCustomer,
			desired: {
				licenseInternalProductId: grant.license_internal_product_id,
				featureId,
				desired: 0,
				resetInterval: null,
				resetIntervalCount: 1,
			},
		});
	}

	await invalidatePooledGrantCaches({ ctx, fullCustomer });
};

const invalidatePooledGrantCaches = async ({
	ctx,
	fullCustomer,
}: {
	ctx: AutumnContext;
	fullCustomer: FullCustomer;
}) => {
	const assignedEntities =
		await licenseAssignmentRepo.listAssignedEntityIdsByCustomer({
			db: ctx.db,
			orgId: ctx.org.id,
			env: ctx.env,
			internalCustomerId: fullCustomer.internal_id,
		});

	const customerId = fullCustomer.id || fullCustomer.internal_id;
	await deleteCachedFullCustomer({
		ctx,
		customerId,
		source: "license.pooled_reconcile",
	});
	for (const { entityId } of assignedEntities) {
		if (!entityId) continue;
		await deleteCachedFullCustomer({
			ctx,
			customerId,
			entityId,
			source: "license.pooled_reconcile",
		});
	}
};
