import { clearOrgWithFeaturesCache } from "@autumn/cache";
import {
	AppEnv,
	customers,
	type Organization,
	organizations,
	RecaseError,
} from "@autumn/shared";
import { and, eq, inArray } from "drizzle-orm";
import { getMiscCacheContext } from "@/external/redis/miscCache/getMiscCacheContext.js";
import { queueBalanceWorkerEvicts } from "@/internal/balances/balanceWorker/queueBalanceWorkerEvicts.js";
import type { DrizzleCli } from "../../../db/initDrizzle";
import type { Logger } from "../../../external/logtail/logtailUtils";
import { CusService } from "../../customers/CusService";
import { OrgService } from "../OrgService";
import { deleteOrgStripeAccounts } from "./deleteOrgStripeAccounts";
import { deleteOrgStripeWebhooks } from "./deleteOrgStripeWebhooks";
import { deleteOrgSvixApps } from "./deleteOrgSvixApps";
import { deletePlatformSubOrg } from "./deletePlatformSubOrg";

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
	const hasCustomers = await db.query.customers.findFirst({
		where: and(eq(customers.org_id, org.id), eq(customers.env, AppEnv.Live)),
	});

	if (hasCustomers)
		throw new RecaseError({
			message: "Cannot delete org with production mode customers",
		});

	const sandboxes = await listOrgSandboxes({ db, orgIds: [org.id] });
	for (const sandbox of sandboxes) {
		await deletePlatformSubOrg({ db, org: sandbox, logger });
	}

	await Promise.all([
		deleteOrgSvixApps({ org, logger }),
		deleteOrgStripeWebhooks({ org, logger }),
		deleteOrgStripeAccounts({ org, logger }),
	]);

	const deleted = await CusService.deleteByOrgId({
		db,
		orgId: org.id,
		env: AppEnv.Sandbox,
	});
	await queueBalanceWorkerEvicts({
		customers: deleted.map(({ id }) => ({
			orgId: org.id,
			env: AppEnv.Sandbox,
			customerId: id,
		})),
	});

	if (deleteOrgFromDb) {
		await OrgService.delete({ db, orgId: org.id });
		await clearOrgWithFeaturesCache({
			ctx: getMiscCacheContext(),
			orgId: org.id,
		});
	}
};
