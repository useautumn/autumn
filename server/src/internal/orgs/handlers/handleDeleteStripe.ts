import { routeHandler } from "@/utils/routerUtils.js";
import { OrgService } from "../OrgService.js";
import { createStripeCli } from "@/external/stripe/utils.js";
import { clearOrgCache } from "../orgUtils/clearOrgCache.js";
import { AppEnv, Organization } from "@autumn/shared";

export const disconnectStripe = async (org: Organization) => {
  const testStripeCli = createStripeCli({ org, env: AppEnv.Sandbox });
  const liveStripeCli = createStripeCli({ org, env: AppEnv.Live });

  const testWebhooks = await testStripeCli.webhookEndpoints.list();
  for (const webhook of testWebhooks.data) {
    if (webhook.url.includes(org.id)) {
      await testStripeCli.webhookEndpoints.del(webhook.id);
    }
  }

  const liveWebhooks = await liveStripeCli.webhookEndpoints.list();
  for (const webhook of liveWebhooks.data) {
    if (webhook.url.includes(org.id)) {
      await liveStripeCli.webhookEndpoints.del(webhook.id);
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

      // 2. Delete webhook endpoint
      try {
        const testStripeCli = createStripeCli({ org, env: AppEnv.Sandbox });
        const liveStripeCli = createStripeCli({ org, env: AppEnv.Live });

        const testWebhooks = await testStripeCli.webhookEndpoints.list();
        for (const webhook of testWebhooks.data) {
          if (webhook.url.includes(org.id)) {
            await testStripeCli.webhookEndpoints.del(webhook.id);
          }
        }

        const liveWebhooks = await liveStripeCli.webhookEndpoints.list();
        for (const webhook of liveWebhooks.data) {
          if (webhook.url.includes(org.id)) {
            await liveStripeCli.webhookEndpoints.del(webhook.id);
          }
        }
      } catch (error: any) {
        console.error("Error deleting stripe webhook(s)");
        console.error(error.message);
      }

      await OrgService.update({
        db,
        orgId: req.orgId,
        updates: {
          stripe_connected: false,
          stripe_config: null,
          default_currency: undefined,
        },
      });

      res.status(200).json({
        message: "Stripe disconnected",
      });
    },
  });
