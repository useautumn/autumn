import { Autumn } from "autumn-js";

const autumn = new Autumn({
  secretKey: process.env.AUTUMN_SECRET_KEY,
  serverURL: "http://localhost:8080",
});

const res = await autumn.customers.getOrCreate({
  customerId: "john",
});

console.log("Res:", res);
