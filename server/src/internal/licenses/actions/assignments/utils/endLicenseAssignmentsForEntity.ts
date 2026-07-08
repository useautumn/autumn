import type { DrizzleCli } from "@/db/initDrizzle.js";
import { withLock } from "@/external/redis/redisUtils.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { buildBillingLockKey } from "@/internal/billing/v2/utils/billingLock/buildBillingLockKey.js";
import { customerLicenseRepo } from "../../../repos/customerLicenseRepo.js";
import { licenseAssignmentRepo } from "../../../repos/licenseAssignmentRepo.js";
import { afterLicenseMutation } from "../../reconcile/afterLicenseMutation.js";

export const endLicenseAssignmentsForEntity = async ({
	ctx,
	internalEntityId,
}: {
	ctx: AutumnContext;
	internalEntityId: string;
}) => {
	const assignments =
		await licenseAssignmentRepo.listActiveAssignmentsByInternalEntityId({
			db: ctx.db,
			internalEntityId,
		});
	if (assignments.length === 0) return;

	const endedAt = Date.now();
	await ctx.db.transaction(async (tx) => {
		const txDb = tx as unknown as DrizzleCli;
		await licenseAssignmentRepo.expireAssignmentsByIds({
			db: txDb,
			assignmentIds: assignments.map((assignment) => assignment.id),
			endedAt,
		});
		for (const assignment of assignments) {
			if (!assignment.license_parent_customer_product_id) continue;
			await customerLicenseRepo.releaseAssignments({
				db: txDb,
				parentCustomerProductId: assignment.license_parent_customer_product_id,
				licenseInternalProductId: assignment.internal_product_id,
				count: 1,
			});
		}
	});

	await withLock({
		lockKey: buildBillingLockKey({
			orgId: ctx.org.id,
			env: ctx.env,
			customerId: assignments[0].internal_customer_id,
		}),
		ttlMs: 120000,
		fn: async () =>
			afterLicenseMutation({
				ctx,
				internalCustomerId: assignments[0].internal_customer_id,
			}),
	});
};
