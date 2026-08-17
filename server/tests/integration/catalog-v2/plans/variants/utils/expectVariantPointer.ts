import { expect } from "bun:test";
import {
	billingControlsFromColumns,
	type CustomerBillingControls,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { ProductService } from "@/internal/products/ProductService.js";

export const getFullPlan = ({
	ctx,
	planId,
	version,
}: {
	ctx: AutumnContext;
	planId: string;
	version?: number;
}) =>
	ProductService.getFull({
		db: ctx.db,
		idOrInternalId: planId,
		orgId: ctx.org.id,
		env: ctx.env,
		version,
	});

/** Variant row points at this base row and is never default. */
export const expectVariantPointerCorrect = async ({
	ctx,
	variantPlanId,
	basePlanId,
	variantVersion,
	baseVersion,
}: {
	ctx: AutumnContext;
	variantPlanId: string;
	basePlanId: string;
	variantVersion?: number;
	baseVersion?: number;
}) => {
	const variant = await getFullPlan({
		ctx,
		planId: variantPlanId,
		...(variantVersion !== undefined ? { version: variantVersion } : {}),
	});
	const base = await getFullPlan({
		ctx,
		planId: basePlanId,
		...(baseVersion !== undefined ? { version: baseVersion } : {}),
	});
	expect(variant.base_internal_product_id).toBe(base.internal_id);
	expect(variant.is_default).toBe(false);
	expect(variant.version).toBe(variantVersion ?? 1);
};

/** Every listed version row has base_internal_product_id null. */
export const expectVariantUnlinkedCorrect = async ({
	ctx,
	variantPlanId,
	versions,
}: {
	ctx: AutumnContext;
	variantPlanId: string;
	versions: number[];
}) => {
	for (const version of versions) {
		const variant = await getFullPlan({ ctx, planId: variantPlanId, version });
		expect(
			variant.base_internal_product_id,
			`v${version} of ${variantPlanId} unlinked`,
		).toBeNull();
	}
};

/** Catalog GET hides variants — assert the product row directly. */
export const expectVariantPlanCorrect = async ({
	ctx,
	variantPlanId,
	version,
	name,
	description,
	group,
	isAddOn,
	config,
	metadata,
	billingControls,
	billingControlsExact,
	allowances,
	featureIds,
}: {
	ctx: AutumnContext;
	variantPlanId: string;
	version?: number;
	name?: string;
	description?: string | null;
	group?: string;
	isAddOn?: boolean;
	config?: { ignore_past_due?: boolean };
	metadata?: Record<string, unknown>;
	billingControls?: CustomerBillingControls;
	billingControlsExact?: CustomerBillingControls;
	allowances?: Record<string, number>;
	featureIds?: string[];
}) => {
	const variant = await getFullPlan({
		ctx,
		planId: variantPlanId,
		...(version !== undefined ? { version } : {}),
	});
	if (name !== undefined) expect(variant.name).toBe(name);
	if (description !== undefined) expect(variant.description).toBe(description);
	if (group !== undefined) expect(variant.group).toBe(group);
	if (isAddOn !== undefined) expect(variant.is_add_on).toBe(isAddOn);
	if (config !== undefined) expect(variant.config).toMatchObject(config);
	if (metadata !== undefined) expect(variant.metadata).toMatchObject(metadata);
	if (billingControls !== undefined) {
		expect(billingControlsFromColumns(variant)).toMatchObject(billingControls);
	}
	if (billingControlsExact !== undefined) {
		expect(billingControlsFromColumns(variant)).toEqual(billingControlsExact);
	}
	if (featureIds !== undefined) {
		expect(
			variant.entitlements.map((entitlement) => entitlement.feature_id).sort(),
		).toEqual([...featureIds].sort());
	}
	if (allowances !== undefined) {
		for (const [featureId, allowance] of Object.entries(allowances)) {
			const entitlement = variant.entitlements.find(
				(candidate) => candidate.feature_id === featureId,
			);
			expect(entitlement, `missing entitlement ${featureId}`).toBeDefined();
			expect(entitlement?.allowance).toBe(allowance);
		}
	}
};
