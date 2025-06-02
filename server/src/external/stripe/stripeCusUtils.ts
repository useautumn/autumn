import { AppEnv, Customer, Organization, ProcessorType } from "@autumn/shared";
import { Stripe } from "stripe";
import { createStripeCli } from "./utils.js";
import RecaseError from "@/utils/errorUtils.js";
import { ErrCode } from "@autumn/shared";
import { StatusCodes } from "http-status-codes";
import { CusService } from "@/internal/customers/CusService.js";
import { DrizzleCli } from "@/db/initDrizzle.js";

export const createStripeCusIfNotExists = async ({
  db,
  org,
  env,
  customer,
  logger,
}: {
  db: DrizzleCli;
  org: Organization;
  env: AppEnv;
  customer: Customer;
  logger: any;
}) => {
  let createNew = false;
  const stripeCli = createStripeCli({ org, env });
  if (!customer.processor || !customer.processor.id) {
    createNew = true;
  } else {
    try {
      await stripeCli.customers.retrieve(customer.processor.id);
    } catch (error) {
      createNew = true;
    }
  }

  if (createNew) {
    logger.info(`Creating new stripe customer for ${customer.id}`);
    const stripeCustomer = await createStripeCustomer({
      org,
      env,
      customer,
    });

    await CusService.update({
      db,
      internalCusId: customer.internal_id,
      update: {
        processor: {
          id: stripeCustomer.id,
          type: ProcessorType.Stripe,
        },
      },
    });

    customer.processor = {
      id: stripeCustomer.id,
      type: ProcessorType.Stripe,
    };
  }

  return;
};

export const createStripeCustomer = async ({
  org,
  env,
  customer,
  testClockId,
}: {
  org: Organization;
  env: AppEnv;
  customer: Customer;
  testClockId?: string;
}) => {
  const stripeCli = createStripeCli({ org, env });

  try {
    const stripeCustomer = await stripeCli.customers.create({
      name: customer.name || undefined,
      email: customer.email || undefined,
      metadata: {
        autumn_id: customer.id || null,
        autumn_internal_id: customer.internal_id,
      },
      test_clock: testClockId,
    });

    return stripeCustomer;
  } catch (error: any) {
    throw new RecaseError({
      message: `Error creating customer in Stripe. ${error.message}`,
      code: ErrCode.StripeCreateCustomerFailed,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
    });
  }
};

export const deleteStripeCustomer = async ({
  org,
  env,
  stripeId,
}: {
  org: Organization;
  env: AppEnv;
  stripeId: string;
}) => {
  const stripeCli = createStripeCli({ org, env });

  const stripeCustomer = await stripeCli.customers.del(stripeId);

  return stripeCustomer;
};

export const getCusPaymentMethod = async ({
  stripeCli,
  stripeId,
  errorIfNone = false,
}: {
  stripeCli: Stripe;
  stripeId?: string;
  errorIfNone?: boolean;
}) => {
  if (!stripeId) {
    return null;
  }

  // const stripeCli = createStripeCli({ org, env });

  const stripeCustomer = (await stripeCli.customers.retrieve(
    stripeId,
  )) as Stripe.Customer;

  let paymentMethodId = stripeCustomer.invoice_settings?.default_payment_method;

  if (!paymentMethodId) {
    let res = await stripeCli.paymentMethods.list({
      customer: stripeId,
    });

    const paymentMethods = res.data;
    paymentMethods.sort((a, b) => b.created - a.created);

    if (res.data.length === 0) {
      if (errorIfNone) {
        throw new RecaseError({
          code: ErrCode.StripeGetPaymentMethodFailed,
          message: `No payment method found for customer ${stripeId}`,
          statusCode: 500,
        });
      }
      return null;
    }

    return paymentMethods[0];
  } else {
    const paymentMethod = await stripeCli.paymentMethods.retrieve(
      paymentMethodId as string,
    );
    return paymentMethod;
  }
};

// 2. Create a payment method and attach to customer
export const attachPmToCus = async ({
  db,
  customer,
  org,
  env,
  willFail = false,
  testClockId,
}: {
  db: DrizzleCli;
  customer: Customer;
  org: Organization;
  env: AppEnv;
  willFail?: boolean;
  testClockId?: string;
}) => {
  // 1. Create stripe customer if not exists

  let stripeCusId = customer.processor?.id;
  if (!stripeCusId) {
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
          id: stripeCustomer.id,
          type: ProcessorType.Stripe,
        },
      },
    });

    stripeCusId = stripeCustomer.id;
    customer.processor = {
      id: stripeCustomer.id,
      type: "stripe",
    };
  }

  const stripeCli = createStripeCli({ org, env });

  try {
    let token = willFail ? "tok_chargeCustomerFail" : "tok_visa";
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
    // console.log("   - Payment method attached");
  } catch (error) {
    console.log("   - Error attaching payment method", error);
  }
};

export const attachFailedPaymentMethod = async ({
  stripeCli,
  customer,
}: {
  stripeCli: Stripe;
  customer: Customer;
}) => {
  // Delete existing payment method
  const paymentMethods = await stripeCli.paymentMethods.list({
    customer: customer.processor?.id,
  });
  for (const pm of paymentMethods.data) {
    await stripeCli.paymentMethods.detach(pm.id);
  }

  const pm = await stripeCli.paymentMethods.create({
    type: "card",
    card: {
      token: "tok_chargeCustomerFail",
    },
  });
  await stripeCli.paymentMethods.attach(pm.id, {
    customer: customer.processor?.id,
  });
};

export const deleteAllStripeCustomers = async ({
  org,
  env,
}: {
  org: Organization;
  env: AppEnv;
}) => {
  const stripeCli = createStripeCli({ org, env });

  const stripeCustomers = await stripeCli.customers.list({
    limit: 100,
  });

  if (stripeCustomers.data.length === 0) {
    return;
  }

  let firstCustomer = stripeCustomers.data[0];
  if (firstCustomer.livemode) {
    throw new RecaseError({
      message: "Cannot delete livemode customers",
      code: ErrCode.StripeDeleteCustomerFailed,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
    });
  }

  let batchSize = 10;
  for (let i = 0; i < stripeCustomers.data.length; i += batchSize) {
    let batch = stripeCustomers.data.slice(i, i + batchSize);
    await Promise.all(batch.map((c) => stripeCli.customers.del(c.id)));
    console.log(
      `Deleted ${i + batch.length}/${stripeCustomers.data.length} customers`,
    );
  }
};
