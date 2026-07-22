import {
	AppEnv,
	customers,
	ErrCode,
	member,
	type Organization,
	organizations,
	RecaseError,
} from "@autumn/shared";
import type { DrizzleCli } from "@server/db/initDrizzle.js";
import { and, eq } from "drizzle-orm";
import type { Logger } from "@/external/logtail/logtailUtils.js";
import { pooledBalanceRepo } from "@/internal/billing/v2/pooledBalances/repos/pooledBalanceRepo.js";
import { CusService } from "@/internal/customers/CusService.js";
import {
	deleteStripeAccounts,
	deleteStripeWebhooks,
	deleteSvixWebhooks,
} from "@/internal/orgs/orgUtils/deleteOrgUtils.js";

/**
 * Deletes a platform-created sub-org and all its dependencies.
 * Used by `DELETE /platform/organizations` and `clearMasterOrg.ts`.
 *
 * `skipLiveCustomerCheck` bypasses the `OrgHasCustomers` guard (test cleanup).
 */
export const deletePlatformSubOrg = async ({
	db,
	org,
	logger,
	skipLiveCustomerCheck = false,
}: {
	db: DrizzleCli;
	org: Organization;
	logger: Logger;
	skipLiveCustomerCheck?: boolean;
}): Promise<void> => {
	if (!skipLiveCustomerCheck) {
		const hasCustomers = await db.query.customers.findFirst({
			where: and(eq(customers.org_id, org.id), eq(customers.env, AppEnv.Live)),
		});

		if (hasCustomers) {
			throw new RecaseError({
				message: "Cannot delete org with production mode customers",
				code: ErrCode.OrgHasCustomers,
				statusCode: 400,
			});
		}
	}

	logger.info("1. Deleting svix webhooks");
	await deleteSvixWebhooks({ org, logger });

	logger.info("2. Deleting stripe webhooks");
	await deleteStripeWebhooks({ org, logger });

	logger.info("3. Deleting stripe accounts");
	await deleteStripeAccounts({ org, logger });

	logger.info("4. Deleting sandbox customers");
	await CusService.deleteByOrgId({
		db,
		orgId: org.id,
		env: AppEnv.Sandbox,
	});

	await db.transaction(async (transaction) => {
		if (skipLiveCustomerCheck) {
			await pooledBalanceRepo.deleteGraphsByOrgId({
				db: transaction,
				orgId: org.id,
			});
		}

		logger.info("5. Deleting org memberships");
		await transaction.delete(member).where(eq(member.organizationId, org.id));

		logger.info("6. Deleting organization");
		await transaction.delete(organizations).where(eq(organizations.id, org.id));
	});
};
