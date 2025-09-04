import { config } from "dotenv";
config();

import {
  getAllEntities,
  getAllFullCustomers,
} from "@/utils/scriptUtils/getAll/getAllAutumnCustomers.js";
import { initDrizzle } from "@/db/initDrizzle.js";
import {
  AppEnv,
  CusProductStatus,
  FullCusProduct,
  FullCustomer,
  Organization,
  Entity,
} from "@autumn/shared";
import Stripe from "stripe";
import assert from "assert";
import { cusProductToPrices } from "@autumn/shared";
import { notNullish } from "@/utils/genUtils.js";
import {
  getAllStripeSchedules,
  getAllStripeSubscriptions,
} from "@/utils/scriptUtils/getAll/getAllStripeSubs.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { createStripeCli } from "@/external/stripe/utils.js";
import { CusService } from "@/internal/customers/CusService.js";
import { getStripeSchedules } from "@/external/stripe/stripeSubUtils.js";
import { createSupabaseClient } from "@/external/supabaseUtils.js";
import { isFreeProduct, isOneOff } from "@/internal/products/productUtils.js";
import { getRelatedCusPrice } from "./internal/customers/cusProducts/cusEnts/cusEntUtils.js";
import { checkCusSubCorrect } from "./utils/checkUtils/checkCustomerCorrect.js";
import { EntityService } from "./internal/api/entities/EntityService.js";

const { db, client } = initDrizzle({ maxConnections: 5 });

let orgSlugs = process.env.ORG_SLUGS!.split(",");
const skipEmails = process.env.SKIP_EMAILS!.split(",");
const skipIds = ["cus_2tXCCwC6iyiftgA6ndSo1Ubb2dx"];

orgSlugs = ["lumenary"];
const customerId = "305fb694-6cdc-4148-bb9b-c73770629f75";

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

  const stripeCusId = customers[0].processor?.id;
  const stripeSubs = stripeCusId
    ? (
        await stripeCli.subscriptions.list({
          customer: stripeCusId,
          expand: ["data.discounts.coupon"],
        })
      ).data
    : [];

  // const stripeSubs = await getStripeSubs({
  //   stripeCli,
  //   subIds: customers[0].customer_products.flatMap(
  //     (cp) => cp.subscription_ids || []
  //   ),
  // });

  const stripeSchedules = await getStripeSchedules({
    stripeCli,
    scheduleIds: customers[0].customer_products.flatMap(
      (cp) => cp.scheduled_ids || []
    ),
  });

  const entities = await EntityService.list({
    db,
    internalCustomerId: customers[0].internal_id,
  });

  return { customers, stripeSubs, stripeSchedules, entities };
};

const checkCustomerCorrect = async ({
  fullCus,
  subs,
  schedules,
  org,
  entities,
}: {
  fullCus: FullCustomer;
  subs: Stripe.Subscription[];
  schedules: Stripe.SubscriptionSchedule[];
  org: Organization;
  entities: Entity[];
}) => {
  if (skipIds.includes(fullCus.internal_id!)) return;

  if (skipEmails.some((skipEmail) => skipEmail === fullCus.email)) {
    return;
  }

  fullCus.entities = entities.filter(
    (entity) => entity.internal_customer_id === fullCus.internal_id
  );

  // console.log(`Checking ${fullCus.email} (${fullCus.id})`);
  const cusProducts = fullCus.customer_products;

  // await expectSubToBeCorrect({
  //   db,
  //   customerId: fullCus.id!,
  //   org,
  //   env: AppEnv.Live,
  // });
  await checkCusSubCorrect({
    db,
    fullCus,
    subs,
    schedules,
    org,
    env: AppEnv.Live,
  });

  for (const cusProduct of cusProducts) {
    if (!cusProduct.subscription_ids) continue;

    if (cusProduct.status == CusProductStatus.Scheduled) {
      // Check if there's a main product elsewhere
      let mainCusProd = cusProducts.find(
        (cp: FullCusProduct) =>
          cp.product.group === cusProduct.product.group &&
          cp.id !== cusProduct.id &&
          cp.status !== CusProductStatus.Scheduled &&
          (cusProduct.internal_entity_id
            ? cusProduct.internal_entity_id == cp.internal_entity_id
            : true)
      );

      assert(
        mainCusProd,
        `Found scheduled cus product with no main product (${cusProduct.product.name})`
      );
    }

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
          cp.internal_entity_id == cusProduct.internal_entity_id
      );

      assert(
        !otherCusProd,
        `found two cus products from the same group: ${otherCusProd?.product.name} and ${cusProduct.product.name}`
      );
    }

    let stripeSubs = subs.filter((sub: any) =>
      cusProduct.subscription_ids!.some((id: string) => id === sub.id)
    );

    assert(
      stripeSubs.length === cusProduct.subscription_ids!.length,
      "number of stripe subs should be the same as number of subscription ids"
    );

    // let subItems = stripeSubs.flatMap((sub: any) => sub.items.data);

    const prices = cusProductToPrices({ cusProduct });

    if (
      isOneOff(prices) ||
      isFreeProduct(prices) ||
      cusProduct.status == CusProductStatus.Scheduled
    ) {
      continue;
    }

    for (const cusEnt of cusProduct.customer_entitlements) {
      let cusPrice = getRelatedCusPrice(cusEnt, cusProduct.customer_prices);

      if (cusEnt.usage_allowed && !cusPrice) {
        assert.fail(
          `Feature ${cusEnt.feature_id} has usage allowed but no related cus price`
        );
      }
    }
  }

  // Other checks to perform
};

const checkCustomerHandleError = async ({
  fullCus,
  subs,
  org,
  schedules,
  entities,
}: {
  fullCus: FullCustomer;
  subs: Stripe.Subscription[];
  org: Organization;
  schedules: Stripe.SubscriptionSchedule[];
  entities: Entity[];
}) => {
  try {
    await checkCustomerCorrect({
      fullCus,
      subs,
      org,
      schedules,
      entities,
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

    let customers: FullCustomer[] = [];
    let stripeSubs: Stripe.Subscription[] = [];
    let stripeSchedules: Stripe.SubscriptionSchedule[] = [];
    let entities: Entity[] = [];

    if (customerId) {
      const res = await getSingleCustomer({
        stripeCli,
        customerId,
        orgId: org.id,
        env,
      });

      customers = res.customers;
      stripeSubs = res.stripeSubs;
      entities = res.entities;
    } else {
      const [customersRes, stripeSubsRes, stripeSchedulesRes, entitiesRes] =
        await Promise.all([
          getAllFullCustomers({
            db,
            orgId: org.id,
            env,
          }),
          getAllStripeSubscriptions({
            stripeCli,
            waitForSeconds: 1,
          }),
          getAllStripeSchedules({
            stripeCli,
            waitForSeconds: 1,
          }),
          getAllEntities({
            db,
            orgId: org.id,
            env,
          }),
        ]);

      customers = customersRes;
      stripeSubs = stripeSubsRes.subscriptions;
      stripeSchedules = stripeSchedulesRes.schedules;
      entities = entitiesRes;
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
            schedules: stripeSchedules,
            org,
            entities,
          })
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
    `COMPLETED ERROR CHECK FOR ${new Date().toISOString().slice(0, 16)}`
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

check()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => {
    process.exit(0);
  });

// let missingUsageCount = 0;

// for (const price of prices) {
//   const subItem = findStripeItemForPrice({
//     stripeItems: subItems,
//     price,
//     stripeProdId: cusProduct.product.processor?.id,
//   });

//   let billingType = getBillingType(price.config);
//   if (
//     billingType == BillingType.UsageInAdvance &&
//     price.config.interval == BillingInterval.OneOff
//   ) {
//     missingUsageCount++;
//     continue;
//   }

//   if (
//     billingType == BillingType.UsageInAdvance &&
//     price.config.interval != BillingInterval.OneOff
//   ) {
//     const featureId = (price.config as any).feature_id;
//     const options = cusProduct.options.find(
//       (o) => o.feature_id == featureId
//     );

//     assert(
//       notNullish(options),
//       `options should exist for prepaid price (featureId: ${featureId})`
//     );

//     let expectedQuantity = options?.upcoming_quantity || options?.quantity;

//     // console.log("Sub item: ", subItem);
//     assert(
//       subItem?.quantity == expectedQuantity,
//       `sub item quantity for prepaid price (featureId: ${featureId}) should be ${expectedQuantity}`
//     );
//     continue;
//   }

//   if (isV4Usage({ price, cusProduct })) {
//     if (nullish(subItem)) {
//       missingUsageCount++;
//     } else {
//       const priceName =
//         (price.config as any).feature_id || price.config.interval;
//       assert(
//         nullish(subItem) ||
//           (subItem?.quantity === 0 &&
//             isLicenseItem({
//               stripeItem: subItem as Stripe.SubscriptionItem,
//             })),
//         `(${cusProduct.product.name}) sub item for price: ${priceName} should exist`
//       );
//     }

//     continue;
//   } else {
//     let priceName =
//       (price.config as any).feature_id || price.config.interval;

//     // console.log("Stripe price ID:", price.config.stripe_price_id);
//     // console.log("Sub items:", subItems);
//     assert(
//       subItem,
//       `(${cusProduct.product.name}) sub item for price: ${priceName} should exist`
//     );
//   }
// }

// assert(
//   prices.length - missingUsageCount === subItems.length,
//   `(${cusProduct.product.name}) number of sub items equivalent to number of prices`
// );
