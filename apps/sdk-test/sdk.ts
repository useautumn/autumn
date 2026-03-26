import { Autumn } from "autumn-js";

const autumn = new Autumn({
  secretKey: process.env.AUTUMN_SECRET_KEY,
  serverURL: "http://localhost:8080",
});

const res = await autumn.check({
  customerId: "john",
  featureId: "messages",
});

console.log("Res:", res);
