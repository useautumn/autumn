import "dotenv/config";

import { getAllFullCustomers } from "@/utils/scriptUtils/getAll/getAllAutumnCustomers.js";
import { initDrizzle } from "@/db/initDrizzle.js";
import {
  AppEnv,
  BillingType,
  CusProductStatus,
  Customer,
  FullCusProduct,
  FullCustomer,
} from "@autumn/shared";
import Stripe from "stripe";
import assert from "assert";
import { cusProductToPrices } from "@/internal/customers/cusProducts/cusProductUtils/convertCusProduct.js";
import {
  findStripeItemForPrice,
  isLicenseItem,
} from "@/external/stripe/stripeSubUtils/stripeSubItemUtils.js";
import { isV4Usage } from "@/internal/products/prices/priceUtils/usagePriceUtils/classifyUsagePrice.js";
import { notNullish, nullish } from "@/utils/genUtils.js";
import { getAllStripeSubscriptions } from "@/utils/scriptUtils/getAll/getAllStripeSubs.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { createStripeCli } from "@/external/stripe/utils.js";
import {
  formatPrice,
  getBillingType,
} from "@/internal/products/prices/priceUtils.js";
import { CusService } from "@/internal/customers/CusService.js";
import { getStripeSubs } from "@/external/stripe/stripeSubUtils.js";
import { createSupabaseClient } from "@/external/supabaseUtils.js";
import { isFreeProduct, isOneOff } from "@/internal/products/productUtils.js";

const { db, client } = initDrizzle({ maxConnections: 5 });
let orgSlugs = process.env.ORG_SLUGS!.split(",");
const skipEmails = process.env.SKIP_EMAILS!.split(",");

orgSlugs = ["athenahq"];

const getSingleCustomer = async ({
  stripeCli,
  customerId,
  orgId,
  env,
}: {
  stripeCli: Stripe;
  customerId: string;
  orgId: string;
  env: AppEnv;
}) => {
  const customers = [
    await CusService.getFull({
      db,
      idOrInternalId: customerId,
      orgId,
      env,
    }),
  ];

  const stripeSubs = await getStripeSubs({
    stripeCli,
    subIds: customers[0].customer_products.flatMap(
      (cp) => cp.subscription_ids || [],
    ),
  });

  return { customers, stripeSubs };
};

const checkCustomerCorrect = async ({
  fullCus,
  subs,
}: {
  fullCus: FullCustomer;
  subs: Stripe.Subscription[];
}) => {
  if (skipEmails.some((skipEmail) => skipEmail === fullCus.email)) {
    return;
  }

  // console.log(`Checking ${fullCus.email} (${fullCus.id})`);
  const cusProducts = fullCus.customer_products;

  for (const cusProduct of cusProducts) {
    if (!cusProduct.subscription_ids) continue;

    if (
      !cusProduct.product.is_add_on &&
      cusProduct.status !== CusProductStatus.Scheduled
    ) {
      let group = cusProduct.product.group;
      let otherCusProd = cusProducts.find(
        (cp: FullCusProduct) =>
          cp.product.group === group &&
          cp.id !== cusProduct.id &&
          !cp.product.is_add_on &&
          cp.status !== CusProductStatus.Scheduled &&
          cp.internal_entity_id == cusProduct.internal_entity_id,
      );

      assert(
        !otherCusProd,
        `found two cus products from the same group: ${otherCusProd?.product.name} and ${cusProduct.product.name}`,
      );
    }

    let stripeSubs = subs.filter((sub: any) =>
      cusProduct.subscription_ids!.some((id: string) => id === sub.id),
    );

    assert(
      stripeSubs.length === cusProduct.subscription_ids!.length,
      "number of stripe subs should be the same as number of subscription ids",
    );

    const subItems = stripeSubs.flatMap((sub: any) => sub.items.data);

    const prices = cusProductToPrices({ cusProduct });

    if (
      isOneOff(prices) ||
      isFreeProduct(prices) ||
      cusProduct.status == CusProductStatus.Scheduled
    ) {
      continue;
    }

    let missingUsageCount = 0;

    for (const price of prices) {
      const subItem = findStripeItemForPrice({
        stripeItems: subItems,
        price,
        stripeProdId: cusProduct.product.processor?.id,
      });

      let billingType = getBillingType(price.config);
      if (billingType == BillingType.UsageInAdvance) {
        const featureId = (price.config as any).feature_id;
        const options = cusProduct.options.find(
          (o) => o.feature_id == featureId,
        );

        assert(
          notNullish(options),
          `options should exist for prepaid price (featureId: ${featureId})`,
        );

        let expectedQuantity = options?.upcoming_quantity || options?.quantity;

        assert(
          subItem?.quantity == expectedQuantity,
          `sub item quantity for prepaid price (featureId: ${featureId}) should be ${expectedQuantity}`,
        );
        continue;
      }

      if (isV4Usage({ price, cusProduct })) {
        if (nullish(subItem)) {
          missingUsageCount++;
        } else {
          const priceName =
            (price.config as any).feature_id || price.config.interval;
          assert(
            nullish(subItem) ||
              (subItem?.quantity === 0 &&
                isLicenseItem({ stripeItem: subItem! })),
            `(${cusProduct.product.name}) sub item for price: ${priceName} should exist`,
          );
        }

        continue;
      } else {
        let priceName =
          (price.config as any).feature_id || price.config.interval;

        // console.log("Stripe price ID:", price.config.stripe_price_id);
        // console.log("Sub items:", subItems);
        assert(
          subItem,
          `(${cusProduct.product.name}) sub item for price: ${priceName} should exist`,
        );
      }
    }

    // console.log("prices:", prices);
    // console.log("subItems:", subItems);
    assert(
      prices.length - missingUsageCount === subItems.length,
      `(${cusProduct.product.name}) number of sub items equivalent to number of prices`,
    );
  }

  // Other checks to perform
};

const checkCustomerHandleError = async ({
  fullCus,
  subs,
}: {
  fullCus: FullCustomer;
  subs: Stripe.Subscription[];
}) => {
  try {
    await checkCustomerCorrect({
      fullCus,
      subs,
    });

    return undefined;
  } catch (error: any) {
    return {
      id: fullCus.id,
      name: fullCus.name,
      email: fullCus.email,
      error: error.message,
    };
  }
};

export const check = async () => {
  const env = AppEnv.Live;
  const sb = createSupabaseClient();

  const today = new Date().toISOString().slice(0, 16);

  for (const slug of orgSlugs) {
    const org = await OrgService.getBySlug({
      db,
      slug,
    });

    if (!org) {
      console.log(`Org ${slug} not found`);
      continue;
    }

    const fileName = `errors/${today}-${org.slug}.json`;

    const stripeCli = createStripeCli({
      org,
      env,
    });

    console.log("--------------------------------");
    console.log(`Running error check for ${org.name}`);

    let customerId;

    // customerId = "0e87a086-89ce-4ad5-99c0-b78bea1c54ed";

    let customers: FullCustomer[] = [];
    let stripeSubs: Stripe.Subscription[] = [];

    if (customerId) {
      const res = await getSingleCustomer({
        stripeCli,
        customerId,
        orgId: org.id,
        env,
      });

      customers = res.customers;
      stripeSubs = res.stripeSubs;
    } else {
      const [customersRes, stripeSubsRes] = await Promise.all([
        getAllFullCustomers({
          db,
          orgId: org.id,
          env,
        }),
        getAllStripeSubscriptions({
          stripeCli,
          waitForSeconds: 1,
        }),
      ]);

      customers = customersRes;
      stripeSubs = stripeSubsRes.subscriptions;
    }

    const batchSize = 1;
    const allErrors = [];
    for (let i = 0; i < customers.length; i += batchSize) {
      const batch = customers.slice(i, i + batchSize);

      const batchCheck: any = [];
      for (const customer of batch) {
        batchCheck.push(
          checkCustomerHandleError({
            fullCus: customer,
            subs: stripeSubs,
          }),
        );
      }

      let results = await Promise.all(batchCheck);
      results = results.filter(notNullish);
      allErrors.push(...results);
    }

    console.log(`Found ${allErrors.length} errors`);

    if (allErrors.length > 0 && customers.length > 1) {
      await sb.storage
        .from("autumn")
        .upload(fileName, JSON.stringify(allErrors, null, 2));

      if (allErrors.length > 0) {
        const slackBody = {
          text: `Error check for ${org.name}`,
          blocks: [
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: `*Error check for ${org.name}*: found ${allErrors.length} errors\nSee results at ${process.env.SUPABASE_URL}/storage/v1/object/public/autumn/${fileName}`,
              },
            },
          ],
        };

        await fetch(process.env.SLACK_WEBHOOK_URL!, {
          method: "POST",
          body: JSON.stringify(slackBody),
        });
      }
    } else {
      console.log(allErrors);
    }
  }

  console.log(
    `COMPLETED ERROR CHECK FOR ${new Date().toISOString().slice(0, 16)}`,
  );

  if (process.env.NODE_ENV == "production") {
    const slackBody = {
      text: `Completed error check for ${new Date().toISOString().slice(0, 16)}`,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `Error check completed for ${new Date().toISOString().slice(0, 16)}`,
          },
        },
      ],
    };

    await fetch(process.env.SLACK_WEBHOOK_URL!, {
      method: "POST",
      body: JSON.stringify(slackBody),
    });
  }
};

check().finally(() => {
  process.exit(0);
});
