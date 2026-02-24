import { Autumn } from "autumn-js";

const autumn = new Autumn();

const res = await autumn.plans.create({
  planId: "pro_plan",
  name: "Pro Plan",
  price: {
    amount: 10,
    interval: "month",
  },
});

console.log(JSON.stringify(res, null, 2));
