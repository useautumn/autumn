import { ErrCode } from "@/errors/errCodes.js";
import { createClerkCli } from "@/external/clerkUtils.js";
import {
  checkKeyValid,
  createWebhookEndpoint,
} from "@/external/stripe/stripeOnboardingUtils.js";
import { encryptData } from "@/utils/encryptUtils.js";
import RecaseError, {
  handleFrontendReqError,
  handleRequestError,
} from "@/utils/errorUtils.js";
import express from "express";
import Stripe from "stripe";
import { OrgService } from "./OrgService.js";
import { createStripeCli } from "@/external/stripe/utils.js";
import { AppEnv } from "@autumn/shared";
import { nullish } from "@/utils/genUtils.js";
import { clearOrgCache } from "./orgUtils/clearOrgCache.js";

export const orgRouter = express.Router();

orgRouter.get("", async (req: any, res) => {
  try {
    if (!req.orgId) {
      res.status(400).json({
        message: "Missing orgId",
      });
      return;
    }

    const org = await OrgService.getFromReq(req);

    res.status(200).json({
      org,
    });
  } catch (error) {
    handleRequestError({
      req,
      error,
      res,
      action: "get org",
    });
  }
});

orgRouter.post("/stripe", async (req: any, res) => {
  try {
    let { testApiKey, liveApiKey, successUrl, defaultCurrency } = req.body;
    let { db, orgId, logtail: logger } = req;
    if (!testApiKey || !liveApiKey || !successUrl) {
      throw new RecaseError({
        message: "Missing required fields",
        code: ErrCode.StripeKeyInvalid,
        statusCode: 400,
      });
    }

    // 1. Check if API keys are valid
    try {
      await clearOrgCache({
        db,
        orgId,
        logger,
      });

      await checkKeyValid(testApiKey);
      await checkKeyValid(liveApiKey);

      // Get default currency from Stripe
      let stripe = new Stripe(testApiKey);
      let account = await stripe.accounts.retrieve();
      if (nullish(defaultCurrency) && nullish(account.default_currency)) {
        throw new RecaseError({
          message: "Default currency not set",
          code: ErrCode.StripeKeyInvalid,
          statusCode: 500,
        });
      } else if (nullish(defaultCurrency)) {
        defaultCurrency = account.default_currency;
      }
    } catch (error: any) {
      throw new RecaseError({
        message: error.message || "Invalid Stripe API keys",
        code: ErrCode.StripeKeyInvalid,
        statusCode: 500,
        data: error,
      });
    }
    // 2. Create webhook endpoint
    let testWebhook: Stripe.WebhookEndpoint;
    let liveWebhook: Stripe.WebhookEndpoint;
    try {
      console.log(`Creating stripe webhook for URL: ${process.env.SERVER_URL}`);

      testWebhook = await createWebhookEndpoint(
        testApiKey,
        AppEnv.Sandbox,
        req.orgId,
      );
      liveWebhook = await createWebhookEndpoint(
        liveApiKey,
        AppEnv.Live,
        req.orgId,
      );
    } catch (error) {
      throw new RecaseError({
        message: "Error creating stripe webhook",
        code: ErrCode.StripeKeyInvalid,
        statusCode: 500,
        data: error,
      });
    }

    // 1. Update org in Supabase
    await OrgService.update({
      db,
      orgId: req.orgId,
      updates: {
        stripe_connected: true,
        default_currency: defaultCurrency,
        stripe_config: {
          test_api_key: encryptData(testApiKey),
          live_api_key: encryptData(liveApiKey),
          test_webhook_secret: encryptData(testWebhook.secret as string),
          live_webhook_secret: encryptData(liveWebhook.secret as string),
          success_url: successUrl,
        },
      },
    });

    // 2. Update org in Clerk
    const clerkCli = createClerkCli();
    await clerkCli.organizations.updateOrganization(req.orgId, {
      publicMetadata: {
        stripe_connected: true,
        default_currency: defaultCurrency,
      },
    });

    res.status(200).json({
      message: "Stripe connected",
    });
  } catch (error: any) {
    handleRequestError({
      req,
      error,
      res,
      action: "connect stripe",
    });
  }
});

orgRouter.delete("/stripe", async (req: any, res) => {
  // 1. Get org
  try {
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

    const clerkCli = createClerkCli();
    await clerkCli.organizations.updateOrganization(req.orgId, {
      publicMetadata: {
        stripe_connected: false,
        default_currency: undefined,
      },
    });

    res.status(200).json({
      message: "Stripe disconnected",
    });
  } catch (error) {
    handleRequestError({
      req,
      error,
      res,
      action: "delete stripe",
    });
  }
});
