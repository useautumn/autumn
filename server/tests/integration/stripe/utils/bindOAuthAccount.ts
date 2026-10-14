import { AppEnv } from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { OrgService } from "@/internal/orgs/OrgService.js";

export const bindOAuthAccount = ({
	db,
	orgId,
	accountId,
}: {
	db: DrizzleCli;
	orgId: string;
	accountId: string;
}) =>
	OrgService.updateStripeConnect({
		db,
		orgId,
		accountId,
		env: AppEnv.Sandbox,
	});
