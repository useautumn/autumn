import { listCusPaymentMethods } from "@/external/stripe/stripeCusUtils.js";
import Stripe from "stripe";

export const getStripeCusData = async ({
  stripeCli,
  stripeId,
}: {
  stripeCli: Stripe;
  stripeId?: string;
}) => {
  if (!stripeId) {
    return { stripeCus: undefined, paymentMethod: null, now: Date.now() };
  }

  let stripeCus = await stripeCli.customers.retrieve(stripeId, {
    expand: ["test_clock", "invoice_settings.default_payment_method"],
  });

  let stripeCusData = stripeCus as Stripe.Customer;
  let testClock =
    stripeCusData.test_clock as Stripe.TestHelpers.TestClock | null;

  // let now = testClock ? testClock.frozen_time * 1000 : Date.now();
  let now = testClock ? testClock.frozen_time * 1000 : undefined;

  let paymentMethod = stripeCusData.invoice_settings
    ?.default_payment_method as Stripe.PaymentMethod | null;

  if (!paymentMethod) {
    let paymentMethods = await listCusPaymentMethods({
      stripeCli,
      stripeId,
    });

    paymentMethod = paymentMethods.length ? paymentMethods[0] : null;
  }

  return { stripeCus: stripeCusData, paymentMethod, now };
};
