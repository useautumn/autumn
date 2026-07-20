import { expect } from "bun:test";
import { type BillingInterval, productToBasePrice } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getFullLicenseProduct } from "./getFullLicenseProduct.js";

export const expectCatalogLicenseCorrect = async ({
	ctx,
	parentPlanId,
	parentVersion,
	licensePlanId,
	included,
	price,
	entitlements,
}: {
	ctx: AutumnContext;
	parentPlanId: string;
	parentVersion: number;
	licensePlanId: string;
	included: number;
	price: { amount: number; interval: BillingInterval };
	entitlements: { featureId: string; allowance: number }[];
}) => {
	const state = await getFullLicenseProduct({
		ctx,
		parentPlanId,
		parentVersion,
		licensePlanId,
	});
	expect(state.parentProduct.version).toBe(parentVersion);
	expect(state.planLicense).toMatchObject({ included, customized: true });
	expect(
		productToBasePrice({ product: state.fullLicenseProduct }),
	).toMatchObject({
		config: price,
	});
	for (const entitlement of entitlements) {
		expect(state.fullLicenseProduct.entitlements).toContainEqual(
			expect.objectContaining({
				feature_id: entitlement.featureId,
				allowance: entitlement.allowance,
			}),
		);
	}
	return state;
};
