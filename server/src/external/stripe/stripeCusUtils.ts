import { AppEnv, Customer, Organization } from "@autumn/shared";
import { Stripe } from "stripe";
import { createStripeCli } from "./utils.js";
import RecaseError from "@/utils/errorUtils.js";
import { ErrCode } from "@/errors/errCodes.js";
import { StatusCodes } from "http-status-codes";

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
