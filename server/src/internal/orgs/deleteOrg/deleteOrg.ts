import {
	AppEnv,
	customers,
	type Organization,
	RecaseError,
} from "@autumn/shared";
import { and, eq } from "drizzle-orm";
import type { DrizzleCli } from "../../../db/initDrizzle";
import type { Logger } from "../../../external/logtail/logtailUtils";
import { CusService } from "../../customers/CusService";
import { OrgService } from "../OrgService";
import { deleteOrgStripeAccounts } from "./deleteOrgStripeAccounts";
import { deleteOrgStripeWebhooks } from "./deleteOrgStripeWebhooks";
import { deleteOrgSvixApps } from "./deleteOrgSvixApps";

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
	}
};
