import { AppEnv } from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { OrgService } from "@/internal/orgs/OrgService.js";

/** Binds an account through the same persistence the OAuth callback uses. */
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
