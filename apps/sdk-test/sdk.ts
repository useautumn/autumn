import { Autumn } from "autumn-js";

const autumn = new Autumn({
  secretKey: process.env.AUTUMN_SECRET_KEY,
  serverURL: "http://localhost:9000",
});

const res = await autumn.check({
  customerId: "cus_123",
  featureId: "messages",
});

console.log("Res:", res);
