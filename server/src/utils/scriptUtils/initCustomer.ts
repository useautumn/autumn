import { DrizzleCli } from "@/db/initDrizzle.js";
import { AppEnv, Customer, Organization, ProcessorType } from "@autumn/shared";
import { createStripeCli } from "../../external/stripe/utils.js";
import { Autumn } from "autumn-js";
import {
  attachPmToCus,
  createStripeCustomer,
} from "../../external/stripe/stripeCusUtils.js";
import { CusService } from "@/internal/customers/CusService.js";
import Stripe from "stripe";
import { deleteCusCache } from "@/internal/customers/cusCache/updateCachedCus.js";

export const createCusInStripe = async ({
  customer,
  org,
  env,
  db,
  testClockId,
}: {
  customer: Customer;
  org: Organization;
  env: AppEnv;
  db: DrizzleCli;
  testClockId?: string;
}) => {
  const stripeCustomer = await createStripeCustomer({
    org,
    env,
    customer,
    testClockId,
  });

  await CusService.update({
    db,
    internalCusId: customer.internal_id,
    update: {
      processor: {
        type: ProcessorType.Stripe,
        id: stripeCustomer.id,
      },
    },
  });

  customer.processor = {
    id: stripeCustomer.id,
    type: "stripe",
  };

  return stripeCustomer;
};

export const initCustomer = async ({
  autumn,
  customerId,
  fingerprint,
  org,
  env,
  db,
  attachPm,
  withTestClock = true,
}: {
  autumn: Autumn;
  customerId: string;
  fingerprint?: string;
  org: Organization;
  env: AppEnv;
  db: DrizzleCli;
  attachPm?: "success" | "fail";
  withTestClock?: boolean;
}) => {
  let customerData = {
    id: customerId,
    name: customerId,
    email: `${customerId}@example.com`,
    fingerprint,
  };

  let customer = await CusService.get({
    db,
    idOrInternalId: customerId,
    orgId: org.id,
    env: env,
  });

  if (customer) {
    await autumn.customers.delete(customerId);
    await deleteCusCache({
      db,
      customerId: customerId,
      org,
      env: env,
    });
  }

  try {
    const response = await autumn.customers.create(customerData);

    // console.log("Created customer:", response);

    let customer = (await CusService.get({
      db,
      idOrInternalId: customerId,
      orgId: org.id,
      env: env,
    })) as Customer;

    // console.log("Org ID:", org.id);
    // console.log("Env:", env);
    // console.log("Customer ID:", customerId);

    // console.log("Customer:", customer);

    // console.log("customer id", customerId);
    // console.log("org id", org.id);
    // console.log("env", env);
    // console.log("customer", customer);

    const stripeCli = createStripeCli({ org: org, env: env });
    let testClockId = "";
    if (withTestClock) {
      const testClock = await stripeCli.testHelpers.testClocks.create({
        frozen_time: Math.floor(Date.now() / 1000),
      });
      testClockId = testClock.id;
    }

    if (attachPm) {
      await attachPmToCus({
        customer,
        org: org,
        env: env,
        db: db,
        willFail: attachPm === "fail",
        testClockId: testClockId || undefined,
      });
    } else {
      await createCusInStripe({
        customer,
        org,
        env,
        db,
        testClockId: testClockId || undefined,
      });
    }

    return {
      customer,
      testClockId: testClockId,
    };
  } catch (error) {
    console.log("Failed to create customer", error);
    throw error;
  }
};
