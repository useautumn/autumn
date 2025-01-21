import stripe from "stripe";
const init = async () => {
  const stripeCli = new stripe(
    "sk_test_51Po43dGHoZUApXXdgIzbsyTTSygoDHMLwoP3m9XXgelkoNA6ChcnqYPAzpnoSUWPK8gMglOURsH2FhxSzDcunCS200uKhf6eu9"
  );

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
