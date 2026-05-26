import "dotenv/config";
import { loadLocalEnv } from "./src/utils/envUtils";
import { AppEnv } from "@autumn/shared";
import { db } from "./src/db/initDrizzle";
import { registerMasterConnectWebhook } from "./src/external/connect/registerMasterConnectWebhook";

loadLocalEnv();

const main = async () => {
  const orgId = process.env.TESTS_ORG_ID;
  const webhookBaseUrl = process.env.STRIPE_WEBHOOK_URL;

  if (!orgId) {
    console.error("TESTS_ORG_ID env variable is not set");
    process.exit(1);
  }
  if (!webhookBaseUrl) {
    console.error("STRIPE_WEBHOOK_URL env variable is not set");
    process.exit(1);
  }

  const result = await registerMasterConnectWebhook({
    db,
    orgId,
    env: AppEnv.Sandbox,
    webhookBaseUrl,
  });

  console.log(
    `Stripe connect webhook ${result.reused ? "reused" : "registered"}: ${result.webhookId}`,
  );
};

main()
  .catch(console.error)
  .then(() => process.exit(0));
