import { Autumn } from "autumn-js";

const autumn = new Autumn();

const res = await autumn.plans.create({
  planId: "pro_plan",
  name: "Pro Plan",
  price: {
    amount: 10,
    interval: "month",
  },
  items: [
    {
      featureId: "messages",
      included: 100,

      price: {
        amount: 0.5,
        interval: "month",
        billingUnits: 100,
        billingMethod: "usage_based",
      },
    },
    {
      featureId: "users",
      price: {
        interval: "month",
        amount: 10,
        billingMethod: "prepaid",
      },
    },
  ],
});

console.log(JSON.stringify(res, null, 2));
