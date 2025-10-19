import { AppEnv, InternalError, type Organization } from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { decryptData } from "@/utils/encryptUtils.js";
import type { Logger } from "../logtail/logtailUtils.js";
import { initMasterStripe } from "./initStripeCli.js";

export const orgToAccountId = ({
	org,
	env,
	noDefaultAccount = false,
}: {
	org: Organization;
	env: AppEnv;
	noDefaultAccount?: boolean;
}): string | undefined => {
	if (env === AppEnv.Sandbox) {
		const config = org.test_stripe_connect;
		if (noDefaultAccount) {
			return config?.account_id;
		}
		return config?.account_id || config?.default_account_id;
	} else {
		return org.live_stripe_connect?.account_id;
	}
};

export const deauthorizeAccount = async ({
	accountId,
	env,
	logger,
}: {
	accountId: string;
	env: AppEnv;
	logger: Logger;
}) => {
	// OAuth-connected accounts must be deauthorized, not deleted
	// Platform-managed accounts can be deleted

	const masterStripe = initMasterStripe({ env });
	try {
		await masterStripe.oauth.deauthorize({
			client_id:
				env === AppEnv.Live
					? process.env.STRIPE_LIVE_CLIENT_ID || ""
					: process.env.STRIPE_SANDBOX_CLIENT_ID || "",
			stripe_user_id: accountId,
		});
		logger.info(`Deauthorized account ${accountId} for ${env}`);
	} catch (error) {
		// If deauthorization fails, the account might have already been disconnected
		// or it's a platform-managed account that needs to be deleted
		logger.error("Failed to deauthorize account, attempting deletion:", error);
	}
};

export const deleteConnectedAccount = async ({
	accountId,
	env,
	logger,
}: {
	accountId: string;
	env: AppEnv;
	logger: Logger;
}) => {
	const masterStripe = initMasterStripe({ env });
	try {
		await masterStripe.accounts.del(accountId);
		logger.info(`Deleted account ${accountId} for ${env}`);
	} catch (error) {
		logger.error(`Failed to delete account ${accountId} for ${env}`, error);
	}
};

export const shouldUseMaster = ({
	org,
	env,
}: {
	org: Organization;
	env: AppEnv;
}) => {
	const useMasterOrg =
		env === AppEnv.Sandbox
			? Boolean(org.test_stripe_connect?.master_org_id) &&
				Boolean(org.test_stripe_connect?.account_id)
			: Boolean(org.live_stripe_connect?.master_org_id) &&
				Boolean(org.live_stripe_connect?.account_id);

	if (useMasterOrg && !org.master) {
		throw new InternalError({
			message: `Master organization not found for ${env} org ${org.id}`,
		});
	}

	if (!useMasterOrg) return false;

	return useMasterOrg;
};

export const getConnectWebhookSecret = async ({
	db,
	orgId,
	env,
}: {
	db: DrizzleCli;
	orgId: string;
	env: AppEnv;
}) => {
	const org = await OrgService.get({ db, orgId });
	const prefix = env === AppEnv.Sandbox ? "test" : "live";
	const secret = org.stripe_config?.[`${prefix}_connect_webhook_secret`];

	if (!secret) {
		throw new InternalError({
			message: `Connect webhook secret not found for ${env} org ${orgId}`,
		});
	}

	const decrypted = decryptData(secret);
	return decrypted;
};
