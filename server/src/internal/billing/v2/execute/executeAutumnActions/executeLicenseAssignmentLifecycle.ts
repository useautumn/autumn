import type { AutumnBillingPlan } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import {
	getDeleteCustomerProducts,
	getUpdateCustomerProducts,
} from "@/internal/billing/v2/utils/billingPlan/customerProductPlanMutations.js";
import { afterLicenseMutation } from "@/internal/licenses/actions/reconcile/afterLicenseMutation.js";
import { licenseGateRepo } from "@/internal/licenses/repos/licenseGateRepo.js";

import { planLicenseRepo } from "@/internal/licenses/repos/planLicenseRepo.js";
import { nullish } from "@/utils/genUtils.js";

/**
 * Cheap plan-level gate in front of the whole-customer license recompute, so
 * customers with no license involvement pay at most two indexed lookups.
 */
export const executeLicenseAssignmentLifecycle = async ({
	ctx,
	autumnBillingPlan,
}: {
	ctx: AutumnContext;
	autumnBillingPlan: AutumnBillingPlan;
}) => {
	if (
		(autumnBillingPlan.customLicenses?.length ?? 0) > 0 ||
		(autumnBillingPlan.licenseOps?.length ?? 0) > 0
	) {
		await afterLicenseMutation({
			ctx,
			customerId: autumnBillingPlan.customerId,
			entityId: autumnBillingPlan.licenseOps?.[0]?.entityId,
		});
		return;
	}

	const planCustomerProducts = [
		...(autumnBillingPlan.insertCustomerProducts ?? []),
		...getUpdateCustomerProducts({ autumnBillingPlan }).map(
			({ customerProduct }) => customerProduct,
		),
		...getDeleteCustomerProducts({ autumnBillingPlan }),
	].filter((customerProduct) => nullish(customerProduct.internal_entity_id));
	if (planCustomerProducts.length === 0) return;

	const parentInternalProductIds = [
		...new Set(
			planCustomerProducts.map(
				(customerProduct) => customerProduct.internal_product_id,
			),
		),
	];
	const links = await planLicenseRepo.listCatalogByParentInternalProductIds({
		db: ctx.db,
		parentInternalProductIds,
	});
	const touchesLicenses =
		links.length > 0 ||
		(await licenseGateRepo.touchesLicenses({
			db: ctx.db,
			internalCustomerId: planCustomerProducts[0].internal_customer_id,
		}));
	if (!touchesLicenses) return;

	await afterLicenseMutation({
		ctx,
		customerId: autumnBillingPlan.customerId,
	});
};
