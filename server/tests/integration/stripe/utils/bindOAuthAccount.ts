import { AppEnv } from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { initMasterStripe } from "@/external/connect/initStripeCli.js";
import { connectOAuthAccount } from "@/internal/orgs/handlers/stripeHandlers/connectOAuthAccount.js";

/** Binds an account through the production OAuth callback path. */
export const bindOAuthAccount = async ({
	db,
	orgId,
	accountId,
}: {
	db: DrizzleCli;
	orgId: string;
	accountId: string;
}) => {
	const result = await connectOAuthAccount({
		db,
		orgId,
		accountId,
		env: AppEnv.Sandbox,
		stripe: initMasterStripe({ env: AppEnv.Sandbox }),
		masterOrgId: null,
	});
	if (result.error) throw new Error(`OAuth binding failed: ${result.error}`);
};
