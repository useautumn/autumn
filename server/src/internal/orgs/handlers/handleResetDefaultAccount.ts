import { AppEnv, ErrCode, Scopes } from "@autumn/shared";
import { initMasterStripe } from "@/external/connect/initStripeCli.js";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import RecaseError from "@/utils/errorUtils.js";
import { OrgService } from "../OrgService.js";
import { createConnectAccount } from "../orgUtils/createConnectAccount.js";

export const handleResetDefaultAccount = createRoute({
	scopes: [Scopes.Organisation.Write],
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { db, org, logger, env } = ctx;

		if (org.id !== process.env.TESTS_ORG_ID) {
			throw new RecaseError({
				message: "This endpoint can only be used for test organizations",
				code: ErrCode.InvalidRequest,
				statusCode: 403,
			});
		}

		if (env !== AppEnv.Sandbox) {
			throw new RecaseError({
				message: "This endpoint only works for sandbox environment",
				code: ErrCode.InvalidRequest,
				statusCode: 400,
			});
		}

		const currentDefaultAccountId = org.test_stripe_connect?.default_account_id;

		if (currentDefaultAccountId) {
			try {
				const masterStripe = initMasterStripe({ env: AppEnv.Sandbox });

				try {
					await masterStripe.accounts.del(currentDefaultAccountId);
					logger.info(`Closed default account: ${currentDefaultAccountId}`);
				} catch (error) {
					logger.warn(
						`Failed to close default account ${currentDefaultAccountId}, it may not exist anymore`,
						{ error },
					);
				}
			} catch (error) {
				logger.error("Error deleting default account", { error });
			}
		}

		const dummyUser = {
			id: "test-user",
			email: org.slug ? `${org.slug}@test.com` : "test@test.com",
			name: org.name || "Test User",
		};

		const newAccount = await createConnectAccount({
			org: org,
			user: dummyUser as any,
		});

		await OrgService.update({
			db,
			orgId: org.id,
			updates: {
				test_stripe_connect: {
					...org.test_stripe_connect,
					default_account_id: newAccount.id,
				},
			},
		});

		logger.info(
			`Reset default account for org ${org.id}, new account: ${newAccount.id}`,
		);

		return c.json({
			message: "Default account reset successfully",
			new_account_id: newAccount.id,
		});
	},
});
