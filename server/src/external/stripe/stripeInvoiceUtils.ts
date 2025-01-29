import { Customer } from "@autumn/shared";

import { AppEnv } from "@autumn/shared";

import { Organization } from "@autumn/shared";
import Stripe from "stripe";
import { getCusPaymentMethod } from "./stripeCusUtils.js";
import { createStripeCli } from "./utils.js";

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
    return false;
  }

  try {
    await stripeCli.invoices.pay(invoice.id, {
      payment_method: paymentMethod as string,
    });
  } catch (error: any) {
    console.log(
      "   ❌ Stripe error: Failed to pay invoice: " + error?.message || error
    );
    return false;
  }

  return true;
};
