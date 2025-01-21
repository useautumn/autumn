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

    // 3. Update org in Clerk
    const testWebhookSecret = testWebhook.secret as string;
    const liveWebhookSecret = liveWebhook.secret as string;

    const clerkPrivateMetadata = {
      stripe: {
        test_api_key: encryptData(testApiKey),
        live_api_key: encryptData(liveApiKey),
        test_webhook_secret: encryptData(testWebhookSecret),
        live_webhook_secret: encryptData(liveWebhookSecret),
        success_url: successUrl,
      },
    };

    const clerkCli = createClerkCli();

    await clerkCli.organizations.updateOrganization(req.org.id, {
      privateMetadata: clerkPrivateMetadata,
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

const syncStripeCustomers = async ({
  pg,
  stripeCli,
  customers,
}: {
  pg: Client;
  stripeCli: Stripe;
  customers: Customer[];
}) => {
  let updateStatements = "";
  for (const customer of customers) {
    try {
      const stripeCustomer = await stripeCli.customers.create({
        name: customer.name,
        email: customer.email || undefined,
      });

      updateStatements += `
        UPDATE customers 
        SET processor = jsonb_build_object('id', '${stripeCustomer.id}', 'type', 'stripe')
        WHERE internal_id = '${customer.internal_id}'\n\n`;
    } catch (error) {
      console.error("Error syncing Stripe customer", error);
    }
  }

  await pg.query(updateStatements);
};

const syncStripeProducts = async ({
  pg,
  stripeCli,
  products,
}: {
  pg: Client;
  stripeCli: Stripe;
  products: Product[];
}) => {
  let updateStatements = "";
  for (const product of products) {
    try {
      const stripeProduct = await stripeCli.products.create({
        name: product.name,
      });

      updateStatements += `
        UPDATE products 
        SET processor = jsonb_build_object('id', '${stripeProduct.id}', 'type', 'stripe')
        WHERE id = '${product.id}'\n\n`;
    } catch (error) {
      console.error("Error syncing Stripe product", error);
    }
  }

  await pg.query(updateStatements);
};

orgRouter.post("/sync", async (req: any, res) => {
  let orgId = req.orgId;

  const org = await OrgService.getFullOrg({
    sb: req.sb,
    orgId: req.orgId,
  });

  const testStripeCli = createStripeCli({
    org,
    env: AppEnv.Sandbox,
  });

  const liveStripeCli = createStripeCli({
    org,
    env: AppEnv.Live,
  });

  console.log("Getting customers & products");
  let liveCustomers = await CusService.getCustomers(req.sb, orgId, AppEnv.Live);
  let sandboxCustomers = await CusService.getCustomers(
    req.sb,
    orgId,
    AppEnv.Sandbox
  );

  let liveProducts = await ProductService.getProducts(
    req.sb,
    orgId,
    AppEnv.Live
  );
  let sandboxProducts = await ProductService.getProducts(
    req.sb,
    orgId,
    AppEnv.Sandbox
  );

  console.log("Syncing Stripe customers");
  await syncStripeCustomers({
    pg: req.pg,
    stripeCli: testStripeCli,
    customers: sandboxCustomers,
  });

  await syncStripeCustomers({
    pg: req.pg,
    stripeCli: liveStripeCli,
    customers: liveCustomers,
  });

  console.log("Syncing Stripe products");
  await syncStripeProducts({
    pg: req.pg,
    stripeCli: liveStripeCli,
    products: liveProducts,
  });

  await syncStripeProducts({
    pg: req.pg,
    stripeCli: testStripeCli,
    products: sandboxProducts,
  });

  res.status(200).json({
    message: "Stripe customers synced",
  });
});
