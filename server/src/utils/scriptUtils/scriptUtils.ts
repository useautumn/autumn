import "dotenv/config";
import { Stripe } from "stripe";
import fs from "fs";
import { AppEnv } from "@autumn/shared";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { createStripeCli } from "@/external/stripe/utils.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { UTCDate } from "@date-fns/utc";
import { subHours } from "date-fns";
import { FeatureService } from "@/internal/features/FeatureService.js";
import { db } from "@/db/initDrizzle.js";
import { createLogger } from "@/external/logtail/logtailUtils.js";
import { ExtendedRequest } from "@/utils/models/Request.js";
import { timeout } from "@/utils/genUtils.js";

export const getAllStripeCustomers = async ({
  numPages,
  limit = 100,
  stripeCli,
}: {
  numPages?: number;
  limit?: number;
  stripeCli: Stripe;
}) => {
  let hasMore = true;
  let startingAfter: string | null = null;
  const allCustomers: any[] = [];

  let pageCount = 0;
  while (hasMore) {
    const response: any = await stripeCli.customers.list({
      limit,
      starting_after: startingAfter || undefined,
    });

    allCustomers.push(...response.data);

    hasMore = response.has_more;

    startingAfter = response.data[response.data.length - 1].id;

    pageCount++;
    if (numPages && pageCount >= numPages) {
      break;
    }
  }

  return {
    customers: allCustomers,
    total: allCustomers.length,
  };
};

export const getAllStripeSubscriptions = async ({
  numPages,
  limit = 100,
  stripeCli,
  waitForSeconds,
}: {
  numPages?: number;
  limit?: number;
  stripeCli: Stripe;
  waitForSeconds?: number;
}) => {
  let hasMore = true;
  let startingAfter: string | null = null;
  const allSubscriptions: any[] = [];

  let pageCount = 0;
  while (hasMore) {
    const response: any = await stripeCli.subscriptions.list({
      limit,
      starting_after: startingAfter || undefined,
      expand: ["data.discounts"],
    });

    allSubscriptions.push(...response.data);

    hasMore = response.has_more;
    startingAfter = response.data[response.data.length - 1].id;

    pageCount++;
    if (numPages && pageCount >= numPages) {
      break;
    }

    console.log("Fetched", allSubscriptions.length, "subscriptions");
    if (waitForSeconds) {
      await timeout(1000);
    }
  }

  return {
    subscriptions: allSubscriptions,
    total: allSubscriptions.length,
  };
};

export const getCusSubsAndProducts = async (path: string) => {
  const customers = JSON.parse(
    fs.readFileSync(`${path}/customers.json`, "utf8")
  ) as Stripe.Customer[];
  const subs = JSON.parse(
    fs.readFileSync(`${path}/subscriptions.json`, "utf8")
  ) as Stripe.Subscription[];
  const products = JSON.parse(fs.readFileSync(`${path}/products.json`, "utf8"));

  return { customers, subs, products };
};

export const saveCusSubsAndProducts = async ({
  stripeCli,
  path,
  orgId,
  env,
}: {
  stripeCli: Stripe;
  path: string;
  orgId: string;
  env: AppEnv;
}) => {
  // Create directory if it doesn't exist
  if (!fs.existsSync(path)) {
    fs.mkdirSync(path, { recursive: true });
  }

  const { data: products } = await stripeCli.products.list({
    limit: 100,
  });
  fs.writeFileSync(`${path}/products.json`, JSON.stringify(products, null, 2));

  const { customers } = await getAllStripeCustomers({
    stripeCli,
  });
  fs.writeFileSync(
    `${path}/customers.json`,
    JSON.stringify(customers, null, 2)
  );

  const { subscriptions } = await getAllStripeSubscriptions({
    stripeCli,
  });

  fs.writeFileSync(
    `${path}/subscriptions.json`,
    JSON.stringify(subscriptions, null, 2)
  );
};

export const initScript = async ({
  orgId,
  env,
}: {
  orgId: string;
  env: AppEnv;
}) => {
  const [org, autumnProducts, features] = await Promise.all([
    OrgService.get({ db, orgId }),
    ProductService.listFull({
      db,
      orgId,
      env,
    }),
    FeatureService.list({
      db,
      orgId,
      env,
    }),
  ]);

  const stripeCli: Stripe = createStripeCli({ org, env });

  const logger = createLogger();

  const req: ExtendedRequest = {
    orgId,
    env,
    org,
    db,
    features,
    logger,
    logtail: logger,
  } as ExtendedRequest;

  return { stripeCli, autumnProducts, req };
};

export const getFirstOfNextMonthUnix = (hoursToSub?: number) => {
  let firstOfNextMonth = new UTCDate(new Date());

  let nextMonth = firstOfNextMonth.getUTCMonth() + 1;
  firstOfNextMonth.setUTCDate(1);
  firstOfNextMonth.setUTCHours(12, 0, 0, 0);
  firstOfNextMonth.setUTCMonth(nextMonth);

  if (hoursToSub) {
    firstOfNextMonth = subHours(firstOfNextMonth, hoursToSub);
  }

  return firstOfNextMonth.getTime();
};
