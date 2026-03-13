import { Autumn } from "autumn-js";

const autumn = new Autumn({
  secretKey: process.env.AUTUMN_SECRET_KEY,
});

const res = await autumn.customers.getOrCreate({
  customerId: "john",
});

const entity = await autumn.entities.create({
  customerId: "john",
  entityId: "name",
  featureId: "user",
  billingControls: {
    spendLimits: [
      {
        featureId: "test",
        enabled: true,
        overageLimit: 10,
      },
    ],
  },
});

// console.log(JSON.stringify(entity.billingControls, null, 2));
