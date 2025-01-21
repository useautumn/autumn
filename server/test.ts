import stripe from "stripe";
import dotenv from "dotenv";
dotenv.config();

const init = async () => {
  const stripeCli = new stripe(process.env.STRIPE_TEST_KEY!);

  // 1. First create a payment method using a test token
  const pm = await stripeCli.paymentMethods.create({
    type: "card",
    // Instead of raw card data, use a test token
    card: {
      token: "tok_visa", // This is a special test token that represents a valid card
    },
  });

  await stripeCli.paymentMethods.attach(pm.id, {
    customer: "cus_RbSiaXsbTzYEWa",
  });

  console.log(pm);
};

init();
