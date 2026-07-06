import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { licenseAssignmentRepo } from "../repos/index.js";

export const endLicenseAssignmentsForEntity = async ({
	ctx,
	internalEntityId,
}: {
	ctx: AutumnContext;
	internalEntityId: string;
}) => {
	const assignments = await licenseAssignmentRepo.listActiveByInternalEntityId({
		db: ctx.db,
		orgId: ctx.org.id,
		env: ctx.env,
		internalEntityId,
	});
	if (assignments.length === 0) return;

	const endedAt = Date.now();
	const provisionedCustomerProductIds = assignments
		.map((assignment) => assignment.provisioned_customer_product_id)
		.filter((id): id is string => id !== null);

	await ctx.db.transaction(async (tx) => {
		const txDb = tx as unknown as typeof ctx.db;
		await licenseAssignmentRepo.endByIds({
			db: txDb,
			assignmentIds: assignments.map((assignment) => assignment.id),
			endedAt,
		});
		if (provisionedCustomerProductIds.length > 0) {
			await licenseAssignmentRepo.expireProvisionedCustomerProductsByIds({
				db: txDb,
				customerProductIds: provisionedCustomerProductIds,
				endedAt,
			});
		}
	});
};
