import { AppEnv, Customer, Organization } from "@autumn/shared";
import stripe, { Stripe } from "stripe";
import { createStripeCli } from "./utils.js";
import RecaseError from "@/utils/errorUtils.js";
import { ErrCode } from "@/errors/errCodes.js";
import { StatusCodes } from "http-status-codes";
import { SupabaseClient } from "@supabase/supabase-js";

export const createStripeCustomer = async ({
  org,
  env,
  customer,
}: {
  org: Organization;
  env: AppEnv;
  customer: Customer;
}) => {
  const stripeCli = createStripeCli({ org, env });

  try {
    const stripeCustomer = await stripeCli.customers.create({
      name: customer.name || undefined,
      email: customer.email || undefined,
      metadata: {
        autumn_id: customer.id,
        autumn_internal_id: customer.internal_id,
      },
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
  org,
  env,
  stripeId,
}: {
  org: Organization;
  env: AppEnv;
  stripeId: string;
}) => {
  const stripeCli = createStripeCli({ org, env });

  const stripeCustomer = (await stripeCli.customers.retrieve(
    stripeId
  )) as Stripe.Customer;

  const paymentMethod = stripeCustomer.invoice_settings.default_payment_method;

  if (!paymentMethod) {
    const paymentMethods = await stripeCli.paymentMethods.list({
      customer: stripeId,
      type: "card",
    });

    if (paymentMethods.data.length === 0) {
      return null;
    }

    return paymentMethods.data[0].id;
  }

  return paymentMethod;
};

// 2. Create a payment method and attach to customer
export const attachPmToCus = async ({
  sb,
  customer,
  org,
  env,
  willFail = false,
}: {
  sb: SupabaseClient;
  customer: Customer;
  org: Organization;
  env: AppEnv;
  willFail?: boolean;
}) => {
  // 1. Create stripe customer if not exists

  let stripeCusId = customer.processor?.stripe_id;
  if (!stripeCusId) {
    const stripeCustomer = await createStripeCustomer({
      org,
      env,
      customer,
    });

    await sb
      .from("customers")
      .update({
        processor: {
          stripe_id: stripeCustomer.id,
        },
      })
      .eq("internal_id", customer.internal_id);
    stripeCusId = stripeCustomer.id;
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
    console.log("   - Payment method attached");
  } catch (error) {
    console.log("   - Error attaching payment method", error);
  }
};
