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

		// Validation: Only allow for test org
		if (org.id !== process.env.TESTS_ORG_ID) {
			throw new RecaseError({
				message: "This endpoint can only be used for test organizations",
				code: ErrCode.InvalidRequest,
				statusCode: 403,
			});
		}

		// Only works for sandbox environment
		if (env !== AppEnv.Sandbox) {
			throw new RecaseError({
				message: "This endpoint only works for sandbox environment",
				code: ErrCode.InvalidRequest,
				statusCode: 400,
			});
		}

		const isWorktree =
			!!process.env.DEV_EXTRA_CORS_ORIGINS &&
			process.env.NODE_ENV !== "production";

		if (isWorktree) {
			const webhookBaseUrl =
				process.env.STRIPE_WEBHOOK_URL ||
				process.env.SERVER_URL ||
				process.env.BETTER_AUTH_URL;

			if (!webhookBaseUrl || !/^https:\/\//.test(webhookBaseUrl)) {
				throw new RecaseError({
					message: "Worktree reset requires a public HTTPS URL — start sparq first",
					code: ErrCode.InvalidRequest,
					statusCode: 400,
				});
			}

			const { registerMasterConnectWebhook } = await import(
				"@/external/connect/registerMasterConnectWebhook.js"
			);
			const result = await registerMasterConnectWebhook({
				db,
				orgId: org.id,
				env: AppEnv.Sandbox,
				webhookBaseUrl,
			});

			logger.info(
				`Reset webhook for worktree org ${org.slug}: ${result.webhookId} (${
					result.reused ? "reused" : "created"
				})`,
			);

			return c.json({
				message: "Worktree webhook registered",
				webhook_id: result.webhookId,
				reused: result.reused,
			});
		}

		const currentDefaultAccountId = org.test_stripe_connect?.default_account_id;

		// Delete the current default account if it exists
		if (currentDefaultAccountId) {
			try {
				const masterStripe = initMasterStripe({ env: AppEnv.Sandbox });

				// Try to close the account
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
				// Continue anyway to create a new account
			}
		}

		// Create a new default account
		// We need a dummy user object for creating the account
		const dummyUser = {
			id: "test-user",
			email: org.slug ? `${org.slug}@test.com` : "test@test.com",
			name: org.name || "Test User",
		};

		const newAccount = await createConnectAccount({
			org: org,
			user: dummyUser as any,
		});

		// Update the organization with the new default account ID
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
