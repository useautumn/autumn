import {
	AppEnv,
	customers,
	ErrCode,
	member,
	organizations,
	type Organization,
	RecaseError,
} from "@autumn/shared";
import { and, eq } from "drizzle-orm";
import type { DrizzleCli } from "@server/db/initDrizzle.js";
import type { Logger } from "@/external/logtail/logtailUtils.js";
import {
	deleteStripeAccounts,
	deleteStripeWebhooks,
	deleteSvixWebhooks,
} from "@/internal/orgs/orgUtils/deleteOrgUtils.js";

/**
 * Deletes a platform-created sub-org: svix webhooks, stripe webhooks,
 * stripe accounts, sandbox customers, members, then the `organizations` row.
 *
 * Used by the `DELETE /platform/organizations` route handler and by the
 * test cleanup script (`clearMasterOrg.ts`).
 *
 * When `skipLiveCustomerCheck` is true, bypasses the `OrgHasCustomers` guard
 * (test cleanup needs this since it's a clean-everything operation).
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
	// Check if any live customers exist
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

	// Delete svix webhooks
	logger.info("1. Deleting svix webhooks");
	await deleteSvixWebhooks({ org, logger });

	// Delete stripe webhooks
	logger.info("2. Deleting stripe webhooks");
	await deleteStripeWebhooks({ org, logger });

	// Delete stripe accounts
	logger.info("3. Deleting stripe accounts");
	await deleteStripeAccounts({ org, logger });

	// Delete all sandbox customers
	logger.info("4. Deleting sandbox customers");
	await db
		.delete(customers)
		.where(
			and(eq(customers.org_id, org.id), eq(customers.env, AppEnv.Sandbox)),
		);

	// Delete memberships
	logger.info("5. Deleting org memberships");
	await db.delete(member).where(eq(member.organizationId, org.id));

	// Delete the organization itself
	logger.info("6. Deleting organization");
	await db.delete(organizations).where(eq(organizations.id, org.id));
};
