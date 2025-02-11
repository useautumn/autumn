import { Customer, ErrCode } from "@autumn/shared";

import { AppEnv } from "@autumn/shared";

import { Organization } from "@autumn/shared";
import Stripe from "stripe";
import { getCusPaymentMethod } from "./stripeCusUtils.js";
import { createStripeCli } from "./utils.js";
import RecaseError, { isPaymentDeclined } from "@/utils/errorUtils.js";
import { isStripeCardDeclined } from "./stripeCardUtils.js";

export const payForInvoice = async ({
  fullOrg,
  env,
  customer,
  invoice,
}: {
  fullOrg: Organization;
  env: AppEnv;
  customer: Customer;
  invoice: Stripe.Invoice;
}) => {
  const stripeCli = createStripeCli({ org: fullOrg, env: env as AppEnv });

  const paymentMethod = await getCusPaymentMethod({
    org: fullOrg,
    env: env as AppEnv,
    stripeId: customer.processor.id,
  });

  if (!paymentMethod) {
    console.log("   ❌ No payment method found");
    return {
      paid: false,
      error: new RecaseError({
        message: "No payment method found",
        code: ErrCode.CustomerHasNoPaymentMethod,
        statusCode: 400,
      }),
    };
  }

  try {
    await stripeCli.invoices.pay(invoice.id, {
      payment_method: paymentMethod as string,
    });
    return {
      paid: true,
      error: null,
    };
  } catch (error: any) {
    console.log(
      "   ❌ Stripe error: Failed to pay invoice: " + error?.message || error
    );

    if (isStripeCardDeclined(error)) {
      return {
        paid: false,
        error: new RecaseError({
          message: `Payment declined: ${error.message}`,
          code: ErrCode.StripeCardDeclined,
          statusCode: 400,
        }),
      };
    }

    return {
      paid: false,
      error: new RecaseError({
        message: "Failed to pay invoice",
        code: ErrCode.PayInvoiceFailed,
      }),
    };
  }
};
