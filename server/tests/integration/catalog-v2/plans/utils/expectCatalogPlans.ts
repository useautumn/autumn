import { expect } from "bun:test";
import {
	type BillingInterval,
	billingControlsFromColumns,
	type CustomerBillingControls,
	type FullProduct,
	type GetCatalogResponse,
	isFixedPrice,
} from "@autumn/shared";
import type { AutumnInt } from "@/external/autumn/autumnCli.js";
import { invalidateProductsCache } from "@/external/redis/actions/productsCache/productsCache.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { ProductService } from "@/internal/products/ProductService.js";

type ExpectedPlan = {
	id: string;
	version?: number;
	name?: string;
	isAddOn?: boolean;
	isDefault?: boolean;
	archived?: boolean;
	/** Feature ids present on entitlements (order-insensitive). */
	featureIds?: string[];
	/** Included allowance per feature_id. */
	allowances?: Record<string, number>;
	/** Base (fixed) price amount + interval. */
	basePrice?: { amount: number; interval: BillingInterval } | null;
	hasFreeTrial?: boolean;
	metadata?: Record<string, unknown>;
	config?: { ignore_past_due?: boolean };
	billingControls?: CustomerBillingControls;
};

const getPlan = async ({
	ctx,
	planId,
	version,
}: {
	ctx: AutumnContext;
	planId: string;
	version?: number;
}): Promise<FullProduct | null> => {
	try {
		return await ProductService.getFull({
			db: ctx.db,
			idOrInternalId: planId,
			orgId: ctx.org.id,
			env: ctx.env,
			version,
			allowNotFound: true,
		});
	} catch {
		return null;
	}
};

const expectCatalogPlanMatches = ({
	plan,
	expectedPlan,
}: {
	plan: GetCatalogResponse["plans"][number];
	expectedPlan: ExpectedPlan;
}) => {
	if (expectedPlan.version !== undefined) {
		expect(plan.version).toBe(expectedPlan.version);
	}
	if (expectedPlan.name !== undefined) {
		expect(plan.name).toBe(expectedPlan.name);
	}
	if (expectedPlan.isAddOn !== undefined) {
		expect(plan.add_on).toBe(expectedPlan.isAddOn);
	}
	if (expectedPlan.isDefault !== undefined) {
		expect(plan.auto_enable).toBe(expectedPlan.isDefault);
	}
	if (expectedPlan.archived !== undefined) {
		expect(plan.archived).toBe(expectedPlan.archived);
	}
	if (expectedPlan.featureIds !== undefined) {
		const featureIds = plan.items.map((item) => item.feature_id);
		expect(featureIds.sort()).toEqual([...expectedPlan.featureIds].sort());
	}
	if (expectedPlan.allowances !== undefined) {
		for (const [featureId, allowance] of Object.entries(
			expectedPlan.allowances,
		)) {
			const item = plan.items.find(
				(candidate) => candidate.feature_id === featureId,
			);
			expect(item, `missing item for ${featureId}`).toBeDefined();
			expect(item?.included).toBe(allowance);
		}
	}
	if (expectedPlan.basePrice !== undefined) {
		if (expectedPlan.basePrice === null) {
			expect(plan.price).toBeNull();
		} else {
			expect(plan.price?.amount).toBe(expectedPlan.basePrice.amount);
			expect(plan.price?.interval).toBe(expectedPlan.basePrice.interval);
		}
	}
	if (expectedPlan.hasFreeTrial !== undefined) {
		expect(Boolean(plan.free_trial)).toBe(expectedPlan.hasFreeTrial);
	}
	if (expectedPlan.metadata !== undefined) {
		expect(plan.metadata).toMatchObject(expectedPlan.metadata);
	}
	if (expectedPlan.config !== undefined) {
		expect(plan.config).toMatchObject(expectedPlan.config);
	}
	if (expectedPlan.billingControls !== undefined) {
		expect(plan.billing_controls).toMatchObject(expectedPlan.billingControls);
	}
};

/**
 * API-first plan shape asserts via catalogV2.get (latest versions only).
 * Optional fields are asserted only when passed.
 */
export const expectCatalogPlansCorrect = async ({
	autumn,
	expected,
}: {
	autumn: AutumnInt;
	expected: ExpectedPlan[];
}) => {
	const catalog = await autumn.catalogV2.get({ include_archived: true });

	for (const expectedPlan of expected) {
		const plan = catalog.plans.find(
			(candidate) => candidate.id === expectedPlan.id,
		);
		expect(plan, `missing plan ${expectedPlan.id} in catalog`).toBeDefined();
		if (!plan) continue;
		expectCatalogPlanMatches({ plan, expectedPlan });
	}
};

/** DB-level asserts — for what the API can't see (historical rows, internals). */
export const expectDbPlansCorrect = async ({
	ctx,
	expected,
}: {
	ctx: AutumnContext;
	expected: ExpectedPlan[];
}) => {
	for (const expectedPlan of expected) {
		const plan = await getPlan({
			ctx,
			planId: expectedPlan.id,
			version: expectedPlan.version,
		});
		expect(plan, `missing plan ${expectedPlan.id}`).toBeTruthy();
		if (!plan) continue;

		if (expectedPlan.version !== undefined) {
			expect(plan.version).toBe(expectedPlan.version);
		}
		if (expectedPlan.name !== undefined) {
			expect(plan.name).toBe(expectedPlan.name);
		}
		if (expectedPlan.isAddOn !== undefined) {
			expect(plan.is_add_on).toBe(expectedPlan.isAddOn);
		}
		if (expectedPlan.isDefault !== undefined) {
			expect(plan.is_default).toBe(expectedPlan.isDefault);
		}
		if (expectedPlan.archived !== undefined) {
			expect(plan.archived).toBe(expectedPlan.archived);
		}
		if (expectedPlan.featureIds !== undefined) {
			const featureIds = plan.entitlements.map(
				(entitlement) => entitlement.feature.id,
			);
			expect(featureIds.sort()).toEqual([...expectedPlan.featureIds].sort());
		}
		if (expectedPlan.allowances !== undefined) {
			for (const [featureId, allowance] of Object.entries(
				expectedPlan.allowances,
			)) {
				const entitlement = plan.entitlements.find(
					(candidate) => candidate.feature.id === featureId,
				);
				expect(
					entitlement,
					`missing entitlement for ${featureId}`,
				).toBeDefined();
				expect(entitlement?.allowance).toBe(allowance);
			}
		}
		if (expectedPlan.basePrice !== undefined) {
			const fixed = plan.prices.find(isFixedPrice);
			if (expectedPlan.basePrice === null) {
				expect(fixed).toBeUndefined();
			} else {
				expect(fixed).toBeDefined();
				expect(fixed?.config.amount).toBe(expectedPlan.basePrice.amount);
				expect(fixed?.config.interval).toBe(expectedPlan.basePrice.interval);
			}
		}
		if (expectedPlan.hasFreeTrial !== undefined) {
			expect(Boolean(plan.free_trial)).toBe(expectedPlan.hasFreeTrial);
		}
		if (expectedPlan.metadata !== undefined) {
			expect(plan.metadata).toMatchObject(expectedPlan.metadata);
		}
		if (expectedPlan.config !== undefined) {
			expect(plan.config).toMatchObject(expectedPlan.config);
		}
		if (expectedPlan.billingControls !== undefined) {
			expect(billingControlsFromColumns(plan)).toMatchObject(
				expectedPlan.billingControls,
			);
		}
	}
};

export const expectDbPlansAbsent = async ({
	ctx,
	planIds,
}: {
	ctx: AutumnContext;
	planIds: string[];
}) => {
	for (const planId of planIds) {
		const plan = await getPlan({ ctx, planId });
		expect(plan, `expected plan ${planId} to be absent`).toBeNull();
	}
};

/** Idempotent — no-ops when the plan is already gone. */
export const deleteDbPlans = async ({
	ctx,
	planIds,
}: {
	ctx: AutumnContext;
	planIds: string[];
}) => {
	for (const planId of planIds) {
		await ProductService.deleteByProductId({
			db: ctx.db,
			productId: planId,
			orgId: ctx.org.id,
			env: ctx.env,
		});
	}
	await invalidateProductsCache({
		orgId: ctx.org.id,
		env: ctx.env,
	});
};
