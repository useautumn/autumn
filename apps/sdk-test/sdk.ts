import { Autumn } from "autumn-js";

const autumn = new Autumn({
  secretKey: process.env.AUTUMN_SECRET_KEY,
});

const res = await autumn.customers.getOrCreate({
  customerId: "john",
});

await autumn.check({
  customerId: "john",
  featureId: "chat_messages",
  lock: {
    enabled: true,
    lockId: "test",
  },
});

console.log(JSON.stringify(res, null, 2));
