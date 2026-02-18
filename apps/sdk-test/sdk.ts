import { join } from "node:path";
import { config as dotenvConfig } from "dotenv";

dotenvConfig({ path: join(__dirname, ".env") });

import { Autumn } from "autumn-js";

const autumn = new Autumn({
  secretKey: process.env.AUTUMN_SECRET_KEY,
});

const customer = await autumn.customers.getOrCreate({
  customerId: "123",
});

console.log("Customer:", customer);

const attachResult = await autumn.billing.attach({
  customerId: customer.id ?? "",
  planId: "pro_plan",
});

console.log("Attach result:", attachResult);
