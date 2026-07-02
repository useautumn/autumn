import { type AutumnBillingPlan, planLicenses } from "@autumn/shared";
import { inArray } from "drizzle-orm";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import {
	getDeleteCustomerProducts,
	getUpdateCustomerProducts,
} from "@/internal/billing/v2/utils/billingPlan/customerProductPlanMutations.js";
import { ensurePoolsForCustomerProducts } from "@/internal/licenses/actions/ensureLicensePools.js";
import { reconcilePooledGrantsForCustomer } from "@/internal/licenses/actions/reconcilePooledGrants.js";
import { transitionLicenseAssignmentsForParents } from "@/internal/licenses/actions/transitionLicenseAssignments.js";
import { isLicensePoolParentStatus } from "@/internal/licenses/licenseUtils.js";
import { nullish } from "@/utils/genUtils.js";

export const executeLicenseAssignmentLifecycle = async ({
	ctx,
	autumnBillingPlan,
}: {
	ctx: AutumnContext;
	autumnBillingPlan: AutumnBillingPlan;
}) => {
	const customizedParentIds = new Set(
		(autumnBillingPlan.customLicenses ?? []).flatMap((change) => [
			change.parentCustomerProductId,
			...(change.previousParentCustomerProductId
				? [change.previousParentCustomerProductId]
				: []),
		]),
	);

	const endedByUpdate = getUpdateCustomerProducts({ autumnBillingPlan })
		.filter(
			({ updates }) =>
				updates?.status &&
				!isLicensePoolParentStatus({ status: updates.status }),
		)
		.map(({ customerProduct }) => customerProduct.id);
	const endedByDelete = getDeleteCustomerProducts({ autumnBillingPlan }).map(
		(customerProduct) => customerProduct.id,
	);
	const endedParentIds = [...endedByUpdate, ...endedByDelete].filter(
		(id) => !customizedParentIds.has(id),
	);

	const transitioned = await transitionLicenseAssignmentsForParents({
		ctx,
		customerId: autumnBillingPlan.customerId,
		parentCustomerProductIds: endedParentIds,
	});

	// Customize-covered parents are excluded: syncCustomLicenseChanges owns their
	// pools, and the in-memory rows don't carry license_set_customized yet.
	const insertedParents = (
		autumnBillingPlan.insertCustomerProducts ?? []
	).filter(
		(customerProduct) =>
			nullish(customerProduct.internal_entity_id) &&
			isLicensePoolParentStatus({ status: customerProduct.status }) &&
			!customizedParentIds.has(customerProduct.id),
	);
	const insertedProductIds = [
		...new Set(
			insertedParents.map(
				(customerProduct) => customerProduct.internal_product_id,
			),
		),
	];
	const insertedLicenseLinks =
		insertedProductIds.length > 0
			? await ctx.db.query.planLicenses.findMany({
					where: inArray(
						planLicenses.parent_internal_product_id,
						insertedProductIds,
					),
				})
			: [];
	const touchesLicenses =
		insertedLicenseLinks.length > 0 ||
		(autumnBillingPlan.customLicenses?.length ?? 0) > 0;
	if (!touchesLicenses) return;

	await ensurePoolsForCustomerProducts({
		ctx,
		customerProducts: insertedParents,
	});
	if (!transitioned) {
		await reconcilePooledGrantsForCustomer({
			ctx,
			customerId: autumnBillingPlan.customerId,
		});
	}
};
