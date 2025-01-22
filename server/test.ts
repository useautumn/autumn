import { createClient } from "@supabase/supabase-js";
import stripe from "stripe";
import dotenv from "dotenv";

dotenv.config();
const customerId = "123";

const sb = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

const { data, error } = await sb
  .from("customers")
  .select("*")
  .eq("id", customerId)
  .eq("env", "sandbox")
  .single();
const stripeCusId = data.processor.id;
const stripeCli = new stripe(process.env.STRIPE_TEST_KEY!);

const paymentMethods = await stripeCli.paymentMethods.list({
  customer: stripeCusId,
});

for (let paymentMethod of paymentMethods.data) {
  await stripeCli.paymentMethods.detach(paymentMethod.id);
}

const failPaymentMethod = await stripeCli.paymentMethods.create({
  type: "card",
  card: {
    token: "tok_chargeCustomerFail",
  },
});

await stripeCli.paymentMethods.attach(failPaymentMethod.id, {
  customer: stripeCusId,
});
