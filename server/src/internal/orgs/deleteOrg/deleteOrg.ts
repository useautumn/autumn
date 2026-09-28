import {
	AppEnv,
	customers,
	type Organization,
	organizations,
	RecaseError,
} from "@autumn/shared";
import { and, eq, inArray } from "drizzle-orm";
import { clearOrgWithFeaturesCache } from "@/external/redis/actions/orgWithFeaturesCache/orgWithFeaturesCache.js";
import type { DrizzleCli } from "../../../db/initDrizzle";
import type { Logger } from "../../../external/logtail/logtailUtils";
import { CusService } from "../../customers/CusService";
import { OrgService } from "../OrgService";
import { deleteOrgStripeAccounts } from "./deleteOrgStripeAccounts";
import { deleteOrgStripeWebhooks } from "./deleteOrgStripeWebhooks";
import { deleteOrgSvixApps } from "./deleteOrgSvixApps";
import { deletePlatformSubOrg } from "./deletePlatformSubOrg";

/** Named sandboxes are separate sub-orgs owned by their master org. */
export const listOrgSandboxes = async ({
	db,
	orgIds,
}: {
	db: DrizzleCli;
	orgIds: string[];
}): Promise<Organization[]> => {
	if (orgIds.length === 0) return [];

	const sandboxes = await db.query.organizations.findMany({
		where: and(
			inArray(organizations.created_by, orgIds),
			eq(organizations.is_sandbox, true),
		),
	});
	return sandboxes as Organization[];
};

export const deleteOrg = async ({
	org,
	db,
	logger,
	deleteOrgFromDb = false,
}: {
	org: Organization;
	db: DrizzleCli;
	logger: Logger;
	deleteOrgFromDb?: boolean;
}) => {
	// 1. Check if any customers
	const hasCustomers = await db.query.customers.findFirst({
		where: and(eq(customers.org_id, org.id), eq(customers.env, AppEnv.Live)),
	});

	if (hasCustomers)
		throw new RecaseError({
			message: "Cannot delete org with production mode customers",
		});

	// Sandboxes would otherwise be orphaned once the master org is gone.
	const sandboxes = await listOrgSandboxes({ db, orgIds: [org.id] });
	for (const sandbox of sandboxes) {
		await deletePlatformSubOrg({ db, org: sandbox, logger });
	}

	await Promise.all([
		deleteOrgSvixApps({ org, logger }),
		deleteOrgStripeWebhooks({ org, logger }),
		deleteOrgStripeAccounts({ org, logger }),
	]);

	await CusService.deleteByOrgId({
		db,
		orgId: org.id,
		env: AppEnv.Sandbox,
	});

	if (deleteOrgFromDb) {
		await OrgService.delete({ db, orgId: org.id });
		// Workers resolve orgs through a 60s cache; without this a deleted org
		// keeps resolving and teardown-time jobs run on stale config.
		await clearOrgWithFeaturesCache({ orgId: org.id });
	}
};
