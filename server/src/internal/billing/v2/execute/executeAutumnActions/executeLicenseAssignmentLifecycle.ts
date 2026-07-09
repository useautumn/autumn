import type { AutumnBillingPlan, FullCusProduct } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import {
	getDeleteCustomerProducts,
	getUpdateCustomerProducts,
} from "@/internal/billing/v2/utils/billingPlan/customerProductPlanMutations.js";
import { afterLicenseMutation } from "@/internal/licenses/actions/reconcile/afterLicenseMutation.js";
import { licenseGateRepo } from "@/internal/licenses/repos/licenseGateRepo.js";
import { planLicenseRepo } from "@/internal/licenses/repos/planLicenseRepo.js";
import { nullish } from "@/utils/genUtils.js";

const planHasExplicitLicenseOps = (plan: AutumnBillingPlan) =>
	(plan.customLicenses?.length ?? 0) > 0 || (plan.licenseOps?.length ?? 0) > 0;

const customerLevelProducts = (plan: AutumnBillingPlan): FullCusProduct[] =>
	[
		...(plan.insertCustomerProducts ?? []),
		...getUpdateCustomerProducts({ autumnBillingPlan: plan }).map(
			({ customerProduct }) => customerProduct,
		),
		...getDeleteCustomerProducts({ autumnBillingPlan: plan }),
	].filter((customerProduct) => nullish(customerProduct.internal_entity_id));

/** True when any customer-level product is linked to a license, by catalog
 * link or by existing customer state. At most two indexed lookups. */
const customerProductsTouchLicenses = async ({
	ctx,
	customerProducts,
}: {
	ctx: AutumnContext;
	customerProducts: FullCusProduct[];
}) => {
	if (customerProducts.length === 0) return false;

	const parentInternalProductIds = [
		...new Set(
			customerProducts.map(
				(customerProduct) => customerProduct.internal_product_id,
			),
		),
	];
	const links = await planLicenseRepo.listCatalogByParentInternalProductIds({
		db: ctx.db,
		parentInternalProductIds,
	});
	if (links.length > 0) return true;

	return licenseGateRepo.touchesLicenses({
		db: ctx.db,
		internalCustomerId: customerProducts[0].internal_customer_id,
	});
};

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
	if (planHasExplicitLicenseOps(autumnBillingPlan)) {
		await afterLicenseMutation({
			ctx,
			customerId: autumnBillingPlan.customerId,
			entityId: autumnBillingPlan.licenseOps?.[0]?.entityId,
		});
		return;
	}

	const touchesLicenses = await customerProductsTouchLicenses({
		ctx,
		customerProducts: customerLevelProducts(autumnBillingPlan),
	});
	if (!touchesLicenses) return;

	await afterLicenseMutation({
		ctx,
		customerId: autumnBillingPlan.customerId,
	});
};
