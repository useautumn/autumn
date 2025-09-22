import { routeHandler } from "@/utils/routerUtils.js";
import { OrgService } from "../OrgService.js";
import { createStripeCli } from "@/external/stripe/utils.js";
import { clearOrgCache } from "../orgUtils/clearOrgCache.js";
import { AppEnv, Organization } from "@autumn/shared";
import { isStripeConnected } from "../orgUtils.js";

export const disconnectStripe = async ({
	org,
	env,
}: {
	org: Organization;
	env: AppEnv;
}) => {
	if (isStripeConnected({ org, env })) {
		const stripeCli = createStripeCli({ org, env });
		const webhooks = await stripeCli.webhookEndpoints.list();
		for (const webhook of webhooks.data) {
			if (webhook.url.includes(org.id) && webhook.url.includes(env)) {
				await stripeCli.webhookEndpoints.del(webhook.id);
			}
		}
	}
};

export const handleDeleteStripe = async (req: any, res: any) =>
	routeHandler({
		req,
		res,
		action: "delete stripe",
		handler: async (req: any, res: any) => {
			const org = await OrgService.getFromReq(req);

			let { db, orgId, logtail: logger } = req;
			await clearOrgCache({
				db,
				orgId,
				logger,
			});

			try {
				await disconnectStripe({ org, env: req.env });
			} catch (error) {
				logger.error(`Failed to disconnect stripe for ${org.id}, ${org.slug}`, {
					error,
				});
			}

			// Update stripe config:
			const newStripeConfig = structuredClone(req.org.stripe_config);
			if (req.env === AppEnv.Sandbox) {
				newStripeConfig.test_api_key = null;
			} else {
				newStripeConfig.live_api_key = null;
			}

			await OrgService.update({
				db,
				orgId: req.orgId,
				updates: {
					stripe_config: newStripeConfig,
				},
			});

			res.status(200).json({
				message: "Stripe disconnected",
			});
		},
	});
