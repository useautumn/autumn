import { join } from "node:path";
import { config as dotenvConfig } from "dotenv";

dotenvConfig({ path: join(__dirname, ".env") });

import { Autumn } from "autumn-js";

const autumn = new Autumn({
  secretKey: process.env.AUTUMN_SECRET_KEY,
});

const res = await autumn.events.aggregate({
  customerId: "john",
  featureId: "messages",
});

console.log(JSON.stringify(res, null, 2));
