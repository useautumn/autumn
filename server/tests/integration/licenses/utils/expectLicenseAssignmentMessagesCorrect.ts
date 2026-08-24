import { expect } from "bun:test";
import { customerEntitlements } from "@autumn/shared";
import { and, eq } from "drizzle-orm";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

/** One assignment's live messages grant: same definition when spared. */
export const expectLicenseAssignmentMessagesCorrect = async ({
	ctx,
	customerProductId,
	featureId,
	balance,
	entitlementId,
}: {
	ctx: AutumnContext;
	customerProductId: string;
	featureId: string;
	balance: number;
	entitlementId?: string;
}) => {
	const [row] = await ctx.db
		.select({
			balance: customerEntitlements.balance,
			entitlementId: customerEntitlements.entitlement_id,
		})
		.from(customerEntitlements)
		.where(
			and(
				eq(customerEntitlements.customer_product_id, customerProductId),
				eq(customerEntitlements.feature_id, featureId),
			),
		);

	expect(row, `expected ${featureId} on ${customerProductId}`).toBeDefined();
	expect(row!.balance).toBe(balance);
	if (entitlementId !== undefined) {
		expect(row!.entitlementId).toBe(entitlementId);
	}
};

export const expectLicenseAssignmentFeaturePresent = async ({
	ctx,
	customerProductId,
	featureId,
}: {
	ctx: AutumnContext;
	customerProductId: string;
	featureId: string;
}) => {
	const [row] = await ctx.db
		.select({ id: customerEntitlements.id })
		.from(customerEntitlements)
		.where(
			and(
				eq(customerEntitlements.customer_product_id, customerProductId),
				eq(customerEntitlements.feature_id, featureId),
			),
		);
	expect(row, `expected ${featureId} on ${customerProductId}`).toBeDefined();
};
