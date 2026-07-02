import type { AutumnBillingPlan } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import {
	getDeleteCustomerProducts,
	getUpdateCustomerProducts,
} from "@/internal/billing/v2/utils/billingPlan/customerProductPlanMutations.js";
import { transitionLicenseAssignmentsForParents } from "@/internal/licenses/actions/transitionLicenseAssignments.js";
import { isLicensePoolParentStatus } from "@/internal/licenses/licenseUtils.js";

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

	await transitionLicenseAssignmentsForParents({
		ctx,
		customerId: autumnBillingPlan.customerId,
		parentCustomerProductIds: endedParentIds,
	});
};
