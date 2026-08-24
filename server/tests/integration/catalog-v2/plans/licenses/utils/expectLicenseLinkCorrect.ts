import { expect } from "bun:test";
import {
	type BillingInterval,
	customerLicenses,
	planLicenses,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { getFullLicenseProduct } from "@tests/integration/licenses/catalog-update/utils/getFullLicenseProduct.js";
import { eq } from "drizzle-orm";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getFullPlan } from "./seedLicensePlans.js";

type ExpectedEntitlement = {
	feature_id: string;
	allowance?: number;
};

type ExpectedPrice = {
	amount: number;
	interval: BillingInterval;
};

/** Catalog license link — only fields passed are checked. */
export const expectLicenseLinkCorrect = async ({
	ctx,
	parentPlanId,
	licensePlanId,
	parentVersion,
	included,
	customized,
	prepaidOnly,
	messagesAllowance,
	entitlements,
	price,
	overlayEntitlementCount,
	licenseInternalProductId,
	licenseVersion,
	parentProductVersion,
	omitFeatureIds,
	planLicenseId,
}: {
	ctx: AutumnContext;
	parentPlanId: string;
	licensePlanId: string;
	parentVersion?: number;
	licenseVersion?: number;
	included?: number;
	customized?: boolean;
	prepaidOnly?: boolean;
	messagesAllowance?: number;
	entitlements?: ExpectedEntitlement[];
	price?: ExpectedPrice;
	overlayEntitlementCount?: number;
	licenseInternalProductId?: string;
	parentProductVersion?: number;
	omitFeatureIds?: string[];
	planLicenseId?: string;
}) => {
	const linked = await getFullLicenseProduct({
		ctx,
		parentPlanId,
		parentVersion,
		licensePlanId,
		licenseVersion,
	});

	if (included !== undefined) {
		expect(linked.planLicense.included).toBe(included);
	}
	if (customized !== undefined) {
		expect(linked.planLicense.customized).toBe(customized);
	}
	if (prepaidOnly !== undefined) {
		expect(linked.planLicense.prepaid_only).toBe(prepaidOnly);
	}
	if (licenseInternalProductId !== undefined) {
		expect(linked.planLicense.license_internal_product_id).toBe(
			licenseInternalProductId,
		);
	}
	if (parentProductVersion !== undefined) {
		expect(linked.parentProduct.version).toBe(parentProductVersion);
	}
	if (overlayEntitlementCount !== undefined) {
		expect(linked.items.entitlements).toHaveLength(overlayEntitlementCount);
	}
	if (price !== undefined) {
		expect(linked.fullLicenseProduct.prices).toContainEqual(
			expect.objectContaining({
				config: expect.objectContaining({
					amount: price.amount,
					interval: price.interval,
				}),
			}),
		);
	}

	const expectedEntitlements: ExpectedEntitlement[] = [
		...(messagesAllowance !== undefined
			? [
					{
						feature_id: TestFeature.Messages,
						allowance: messagesAllowance,
					},
				]
			: []),
		...(entitlements ?? []),
	];
	if (expectedEntitlements.length > 0) {
		expect(linked.fullLicenseProduct.entitlements).toEqual(
			expect.arrayContaining(
				expectedEntitlements.map((entitlement) =>
					expect.objectContaining(entitlement),
				),
			),
		);
	}
	if (omitFeatureIds) {
		for (const featureId of omitFeatureIds) {
			expect(
				linked.fullLicenseProduct.entitlements.some(
					(entitlement) => entitlement.feature_id === featureId,
				),
			).toBe(false);
		}
	}
	if (planLicenseId !== undefined) {
		expect(linked.planLicense.id).toBe(planLicenseId);
	}

	return linked;
};

export const expectPinDidNotLeakStock = ({
	childMessagesEntitlementId,
	overlayMessagesEntitlementId,
}: {
	childMessagesEntitlementId: string;
	overlayMessagesEntitlementId: string;
}) => {
	expect(overlayMessagesEntitlementId).not.toBe(childMessagesEntitlementId);
};

export const expectCustomerLicensePinnedTo = async ({
	ctx,
	customerLicenseId,
	planLicenseId,
}: {
	ctx: AutumnContext;
	customerLicenseId: string;
	planLicenseId: string;
}) => {
	const row = await ctx.db.query.customerLicenses.findFirst({
		where: eq(customerLicenses.id, customerLicenseId),
	});
	expect(row?.plan_license_id).toBe(planLicenseId);
};

export const expectPlanLicenseRetired = async ({
	ctx,
	planLicenseId,
}: {
	ctx: AutumnContext;
	planLicenseId: string;
}) => {
	const row = await ctx.db.query.planLicenses.findFirst({
		where: eq(planLicenses.id, planLicenseId),
	});
	expect(row).toBeDefined();
	expect(row?.is_custom).toBe(true);
};

export const featureEntitlementId = ({
	entitlements,
	featureId,
}: {
	entitlements: { id: string; feature_id?: string | null }[];
	featureId: string;
}) => {
	const entitlement = entitlements.find((row) => row.feature_id === featureId);
	expect(entitlement, `missing entitlement ${featureId}`).toBeDefined();
	if (!entitlement) throw new Error(`missing entitlement ${featureId}`);
	return entitlement.id;
};

export const expectLicenseLinkMissing = async ({
	ctx,
	parentPlanId,
	licensePlanId,
	parentVersion,
}: {
	ctx: AutumnContext;
	parentPlanId: string;
	licensePlanId: string;
	parentVersion?: number;
}) => {
	await expect(
		getFullLicenseProduct({
			ctx,
			parentPlanId,
			parentVersion,
			licensePlanId,
		}),
	).rejects.toThrow(/is not linked/);
};

export const expectPlanMessagesAllowance = async ({
	ctx,
	planId,
	version,
	allowance,
}: {
	ctx: AutumnContext;
	planId: string;
	version?: number;
	allowance: number;
}) => {
	const plan = await getFullPlan({ ctx, planId, version });
	expect(plan.entitlements).toContainEqual(
		expect.objectContaining({
			feature_id: TestFeature.Messages,
			allowance,
		}),
	);
	return plan;
};

export const expectLatestPlanVersion = async ({
	ctx,
	planId,
	version,
}: {
	ctx: AutumnContext;
	planId: string;
	version: number;
}) => {
	const plan = await getFullPlan({ ctx, planId });
	expect(plan.version).toBe(version);
	return plan;
};
