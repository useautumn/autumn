import { ErrCode } from "@/errors/errCodes.js";
import { createClerkCli, createClerkOrg } from "@/external/clerkUtils.js";
import {
  checkKeyValid,
  createWebhookEndpoint,
} from "@/external/stripe/stripeOnboardingUtils.js";
import { encryptData } from "@/utils/encryptUtils.js";
import RecaseError, { handleRequestError } from "@/utils/errorUtils.js";
import express from "express";
import Stripe from "stripe";
import { CusService } from "../customers/CusService.js";
import { OrgService } from "./OrgService.js";
import { Customer, Organization, Product } from "@autumn/shared";
import { createStripeCli } from "@/external/stripe/utils.js";
import { Client } from "pg";
import { ProductService } from "../products/ProductService.js";
import { AppEnv } from "@autumn/shared";

export const orgRouter = express.Router();

orgRouter.get("", async (req: any, res) => {
  const org = await OrgService.getFullOrg({
    sb: req.sb,
    orgId: req.orgId,
  });

  res.status(200).json({
    org,
  });
});

orgRouter.post("/stripe", async (req: any, res) => {
  try {
    const { testApiKey, liveApiKey, successUrl, defaultCurrency } = req.body;

    if (!testApiKey || !liveApiKey || !defaultCurrency || !successUrl) {
      throw new RecaseError({
        message: "Missing required fields",
        code: ErrCode.StripeKeyInvalid,
        statusCode: 400,
      });
    }

    // 1. Check if API keys are valid
    try {
      await checkKeyValid(testApiKey);
      await checkKeyValid(liveApiKey);
    } catch (error) {
      throw new RecaseError({
        message: "Invalid Stripe API keys",
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
        req.org.id
      );
      liveWebhook = await createWebhookEndpoint(
        liveApiKey,
        AppEnv.Live,
        req.org.id
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
      sb: req.sb,
      orgId: req.org.id,
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
    await clerkCli.organizations.updateOrganization(req.org.id, {
      publicMetadata: {
        stripe_connected: true,
        default_currency: defaultCurrency,
      },
    });

    res.status(200).json({
      message: "Stripe connected",
    });
  } catch (error: any) {
    if (error instanceof RecaseError) {
      error.print();

      res.status(error.statusCode).json({
        message: error.message,
        code: error.code,
      });
    } else {
      console.error("Error connecting Stripe", error);
      res.status(500).json({
        error: "Error connecting Stripe",
        message: error.message,
      });
    }
  }
});
