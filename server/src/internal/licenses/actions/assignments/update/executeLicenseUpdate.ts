import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { customerLicenseRepo } from "../../../repos/customerLicenseRepo.js";
import { endProvisionedCustomerProducts } from "../utils/endProvisionedCustomerProducts.js";
import type { LicenseCancelAction, LicenseUpdateContext } from "./types.js";

export const executeLicenseUpdate = async ({
	ctx,
	context,
	plan,
}: {
	ctx: AutumnContext;
	context: LicenseUpdateContext;
	plan: { action: LicenseCancelAction; endedAt: number };
}) => {
	const { assignment, detachCustomerId } = context;

	await endProvisionedCustomerProducts({
		ctx,
		customerId: detachCustomerId,
		assignmentIds: [assignment.id],
		endedAt: plan.endedAt,
	});

	if (assignment.license_parent_customer_product_id) {
		await customerLicenseRepo.releaseAssignments({
			db: ctx.db,
			parentCustomerProductId: assignment.license_parent_customer_product_id,
			licenseInternalProductId: assignment.internal_product_id,
			count: 1,
		});
	}
};
