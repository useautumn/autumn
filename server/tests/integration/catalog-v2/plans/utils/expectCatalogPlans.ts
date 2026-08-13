import { expect } from "bun:test";
import {
	type ApiPlanItemV1,
	type BillingInterval,
	type BillingMethod,
	billingControlsFromColumns,
	type CustomerBillingControls,
	type FreeTrialDuration,
	type FullProduct,
	type GetCatalogResponse,
	isFixedPrice,
	type OnDecrease,
	type OnIncrease,
	products,
	type ResetInterval,
	type RolloverExpiryDurationType,
	type TierBehavior,
} from "@autumn/shared";
import { and, eq } from "drizzle-orm";
import type { AutumnInt } from "@/external/autumn/autumnCli.js";
import { invalidateProductsCache } from "@/external/redis/actions/productsCache/productsCache.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { ProductService } from "@/internal/products/ProductService.js";

/** Containment matcher for a catalog plan item — assert only fields passed. */
export type ExpectedPlanItem = {
	feature_id: string;
	included?: number;
	unlimited?: boolean;
	pooled?: boolean;
	reset?: {
		interval?: ResetInterval;
		interval_count?: number;
	} | null;
	price?: {
		amount?: number;
		tiers?: Array<{
			to: number | "inf";
			amount?: number;
			flat_amount?: number;
			additional_currencies?: Array<{ currency: string; amount: number }>;
		}>;
		tier_behavior?: TierBehavior;
		interval?: BillingInterval;
		interval_count?: number;
		billing_units?: number;
		billing_method?: BillingMethod;
		max_purchase?: number | null;
		additional_currencies?: Array<{ currency: string; amount: number }>;
	} | null;
	proration?: {
		on_increase?: OnIncrease;
		on_decrease?: OnDecrease;
	};
	rollover?: {
		max?: number | null;
		max_percentage?: number | null;
		expiry_duration_type?: RolloverExpiryDurationType;
		expiry_duration_length?: number;
	};
	entity_feature_id?: string;
};

type ExpectedPlan = {
	id: string;
	version?: number;
	name?: string;
	description?: string | null;
	group?: string;
	isAddOn?: boolean;
	isDefault?: boolean;
	archived?: boolean;
	/** Feature ids present on entitlements (order-insensitive). */
	featureIds?: string[];
	/** Included allowance per feature_id. */
	allowances?: Record<string, number>;
	/** Granular item shape matchers (containment, keyed by feature_id). */
	items?: ExpectedPlanItem[];
	/** Base (fixed) price amount + interval. */
	basePrice?: {
		amount: number;
		interval: BillingInterval;
		interval_count?: number;
		additional_currencies?: Array<{ currency: string; amount: number }>;
	} | null;
	/**
	 * Exact free-trial shape. Non-null: assert duration_length / duration_type /
	 * card_required / on_end (both sides `?? null`). Null: assert absent.
	 */
	freeTrial?: {
		duration_length: number;
		duration_type: FreeTrialDuration;
		card_required: boolean;
		on_end?: "bill" | "revert" | null;
	} | null;
	metadata?: Record<string, unknown>;
	config?: { ignore_past_due?: boolean };
	billingControls?: CustomerBillingControls;
	/** Deep equality — asserts absent columns too (cross-contamination checks). */
	billingControlsExact?: CustomerBillingControls;
};

const expectApiFreeTrialMatches = ({
	actual,
	expected,
}: {
	actual:
		| {
				duration_length?: number;
				duration_type?: FreeTrialDuration;
				card_required?: boolean;
				on_end?: "bill" | "revert" | null;
		  }
		| null
		| undefined;
	expected: NonNullable<ExpectedPlan["freeTrial"]>;
}) => {
	expect(actual, "expected free_trial to be present").toBeTruthy();
	if (!actual) return;
	expect({
		duration_length: actual.duration_length,
		duration_type: actual.duration_type,
		card_required: actual.card_required,
		on_end: actual.on_end ?? null,
	}).toEqual({
		duration_length: expected.duration_length,
		duration_type: expected.duration_type,
		card_required: expected.card_required,
		on_end: expected.on_end ?? null,
	});
};

const expectDbFreeTrialMatches = ({
	actual,
	expected,
}: {
	actual:
		| {
				length?: number | null;
				duration?: string | null;
				card_required?: boolean | null;
				on_end?: string | null;
		  }
		| null
		| undefined;
	expected: NonNullable<ExpectedPlan["freeTrial"]>;
}) => {
	expect(actual, "expected free_trial row to be present").toBeTruthy();
	if (!actual) return;
	expect({
		duration_length: actual.length,
		duration_type: actual.duration,
		card_required: actual.card_required,
		on_end: actual.on_end ?? null,
	}).toEqual({
		duration_length: expected.duration_length,
		duration_type: expected.duration_type,
		card_required: expected.card_required,
		on_end: expected.on_end ?? null,
	});
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

const expectPlanItemMatches = ({
	item,
	expected,
}: {
	item: ApiPlanItemV1;
	expected: ExpectedPlanItem;
}) => {
	if (expected.included !== undefined) {
		expect(item.included).toBe(expected.included);
	}
	if (expected.unlimited !== undefined) {
		expect(item.unlimited).toBe(expected.unlimited);
	}
	if (expected.pooled !== undefined) {
		expect(item.pooled).toBe(expected.pooled);
	}
	if (expected.reset === null) {
		expect(item.reset).toBeNull();
	} else if (expected.reset !== undefined) {
		expect(item.reset).toBeTruthy();
		if (expected.reset.interval !== undefined) {
			expect(item.reset?.interval).toBe(expected.reset.interval);
		}
		if (expected.reset.interval_count !== undefined) {
			expect(item.reset?.interval_count).toBe(expected.reset.interval_count);
		}
	}
	if (expected.price === null) {
		expect(item.price).toBeNull();
	} else if (expected.price !== undefined) {
		expect(item.price).toBeTruthy();
		const price = expected.price;
		if (price.amount !== undefined) {
			expect(item.price?.amount).toBe(price.amount);
		}
		if (price.tiers !== undefined) {
			expect(item.price?.tiers).toMatchObject(price.tiers);
		}
		if (price.tier_behavior !== undefined) {
			expect(item.price?.tier_behavior).toBe(price.tier_behavior);
		}
		if (price.interval !== undefined) {
			expect(item.price?.interval).toBe(price.interval);
		}
		if (price.interval_count !== undefined) {
			expect(item.price?.interval_count).toBe(price.interval_count);
		}
		if (price.billing_units !== undefined) {
			expect(item.price?.billing_units).toBe(price.billing_units);
		}
		if (price.billing_method !== undefined) {
			expect(item.price?.billing_method).toBe(price.billing_method);
		}
		if (price.max_purchase !== undefined) {
			expect(item.price?.max_purchase).toBe(price.max_purchase);
		}
		if (price.additional_currencies !== undefined) {
			expect(item.price?.additional_currencies).toEqual(
				price.additional_currencies,
			);
		}
	}
	if (expected.proration !== undefined) {
		expect(item.proration).toMatchObject(expected.proration);
	}
	if (expected.rollover !== undefined) {
		expect(item.rollover).toMatchObject(expected.rollover);
	}
	if (expected.entity_feature_id !== undefined) {
		expect(item.entity_feature_id).toBe(expected.entity_feature_id);
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
	if (expectedPlan.description !== undefined) {
		expect(plan.description).toBe(expectedPlan.description);
	}
	if (expectedPlan.group !== undefined) {
		expect(plan.group).toBe(expectedPlan.group);
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
	if (expectedPlan.items !== undefined) {
		for (const expectedItem of expectedPlan.items) {
			const item = plan.items.find(
				(candidate) => candidate.feature_id === expectedItem.feature_id,
			);
			expect(item, `missing item for ${expectedItem.feature_id}`).toBeDefined();
			if (!item) continue;
			expectPlanItemMatches({ item, expected: expectedItem });
		}
	}
	if (expectedPlan.basePrice !== undefined) {
		if (expectedPlan.basePrice === null) {
			expect(plan.price).toBeNull();
		} else {
			expect(plan.price?.amount).toBe(expectedPlan.basePrice.amount);
			expect(plan.price?.interval).toBe(expectedPlan.basePrice.interval);
			if (expectedPlan.basePrice.interval_count !== undefined) {
				expect(plan.price?.interval_count).toBe(
					expectedPlan.basePrice.interval_count,
				);
			}
			if (expectedPlan.basePrice.additional_currencies !== undefined) {
				expect(plan.price?.additional_currencies).toEqual(
					expectedPlan.basePrice.additional_currencies,
				);
			}
		}
	}
	if (expectedPlan.freeTrial !== undefined) {
		if (expectedPlan.freeTrial === null) {
			expect(plan.free_trial ?? undefined).toBeUndefined();
		} else {
			expectApiFreeTrialMatches({
				actual: plan.free_trial,
				expected: expectedPlan.freeTrial,
			});
		}
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
	if (expectedPlan.billingControlsExact !== undefined) {
		expect(plan.billing_controls).toEqual(expectedPlan.billingControlsExact);
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
		if (expectedPlan.freeTrial !== undefined) {
			if (expectedPlan.freeTrial === null) {
				expect(plan.free_trial ?? undefined).toBeUndefined();
			} else {
				expectDbFreeTrialMatches({
					actual: plan.free_trial,
					expected: expectedPlan.freeTrial,
				});
			}
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

/** Assert the exact set of version numbers that exist for a plan id. */
export const expectPlanVersionsCorrect = async ({
	ctx,
	planId,
	versions,
}: {
	ctx: AutumnContext;
	planId: string;
	versions: number[];
}) => {
	const rows = await ctx.db
		.select({ version: products.version })
		.from(products)
		.where(
			and(
				eq(products.id, planId),
				eq(products.org_id, ctx.org.id),
				eq(products.env, ctx.env),
			),
		);
	expect(
		rows.map((row) => row.version).sort((a, b) => a - b),
		`${planId}: version set`,
	).toEqual([...versions].sort((a, b) => a - b));
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
