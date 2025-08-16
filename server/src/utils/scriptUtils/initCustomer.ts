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
    const res = await autumn.customers.create(customerData);

    let customer = (await CusService.get({
      db,
      idOrInternalId: customerId,
      orgId: org.id,
      env: env,
    })) as Customer;

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

export const attachPaymentMethod = async ({
  stripeCli,
  stripeCusId,
  type,
}: {
  stripeCli: Stripe;
  stripeCusId: string;
  type: "success" | "fail";
}) => {
  try {
    let token = type === "fail" ? "tok_chargeCustomerFail" : "tok_visa";
    const pm = await stripeCli.paymentMethods.create({
      type: "card",
      card: {
        token,
      },
    });

    await stripeCli.paymentMethods.attach(pm.id, {
      customer: stripeCusId,
    });

    await stripeCli.customers.update(stripeCusId, {
      invoice_settings: {
        default_payment_method: pm.id,
      },
    });
  } catch (error) {
    console.log("failed to attach payment method", error);
  }
};

// V2 initializes the customer in Stripe, then creates the customer in Autumn
export const initCustomerV2 = async ({
  autumn,
  customerId,
  org,
  env,
  db,
  attachPm,
  withTestClock = true,
}: {
  autumn: Autumn;
  customerId: string;
  org: Organization;
  env: AppEnv;
  db: DrizzleCli;
  attachPm?: "success" | "fail";
  withTestClock?: boolean;
}) => {
  let name = customerId;
  let email = `${customerId}@example.com`;
  let fingerprint_ = "";
  const stripeCli = createStripeCli({ org, env });

  let testClockId = undefined;

  if (withTestClock) {
    const testClock = await stripeCli.testHelpers.testClocks.create({
      frozen_time: Math.floor(Date.now() / 1000),
    });
    testClockId = testClock.id;
  }

  // 1. Create stripe customer
  const stripeCus = await stripeCli.customers.create({
    email,
    name,
    test_clock: testClockId,
  });

  // 2. Create customer
  try {
    await autumn.customers.delete(customerId);
  } catch (error) {}
  await autumn.customers.create({
    id: customerId,
    name,
    email,
    fingerprint: fingerprint_,
    // @ts-ignore
    stripe_id: stripeCus.id,
  });

  // 3. Attach payment method
  if (attachPm) {
    await attachPaymentMethod({
      stripeCli,
      stripeCusId: stripeCus.id,
      type: attachPm,
    });
  }

  return {
    testClockId: testClockId || "",
  };
};
