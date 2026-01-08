import { redis } from "../../src/external/redis/initRedis.js";
import { DEDUCT_FROM_CUSTOMER_ENTITLEMENTS_SCRIPT } from "../../src/internal/balances/utils/redis/luaScriptsV2.js";

const testKey = "test:lua:deduct:" + Date.now();

// Simulate state AFTER first track (600 deducted from 500 balance)
// pay-per-use: balance=-100 (overage)
// Then lifetime is attached with balance=200
const testFullCustomer = {
  id: "cus_test",
  internal_id: "cus_internal_test",
  customer_products: [
    {
      id: "cp_payperuse",
      customer_entitlements: [
        {
          id: "ce_payperuse",
          balance: -100,
          additional_balance: 0,
          adjustment: 0,
          entities: null
        }
      ]
    },
    {
      id: "cp_lifetime",
      customer_entitlements: [
        {
          id: "ce_lifetime",
          balance: 200,
          additional_balance: 0,
          adjustment: 0,
          entities: null
        }
      ]
    }
  ]
};

await redis.call("JSON.SET", testKey, "$", JSON.stringify(testFullCustomer));

// Sorted entitlements: lifetime first (no overage), pay-per-use second (has overage)
const luaParams = {
  sorted_entitlements: [
    {
      customer_entitlement_id: "ce_lifetime",
      credit_cost: 1,
      entity_feature_id: null,
      usage_allowed: false,
      min_balance: null,
      max_balance: 200
    },
    {
      customer_entitlement_id: "ce_payperuse",
      credit_cost: 1,
      entity_feature_id: null,
      usage_allowed: true,
      min_balance: null,
      max_balance: 500
    }
  ],
  amount_to_deduct: 150,
  target_balance: null,
  target_entity_id: null,
  rollover_ids: null,
  cus_ent_ids: ["ce_lifetime", "ce_payperuse"],
  skip_additional_balance: true,
  overage_behaviour: "cap",
  feature_id: "messages"
};

console.log("=== INPUT ===");
console.log("Deducting 150 from customer with:");
console.log("  - lifetime: balance=200 (usage_allowed=false)");
console.log("  - pay-per-use: balance=-100 (usage_allowed=true, already in overage)");
console.log("Expected: Deduct 150 from lifetime → lifetime balance=50, pay-per-use unchanged");

const result = await redis.eval(
  DEDUCT_FROM_CUSTOMER_ENTITLEMENTS_SCRIPT,
  1,
  testKey,
  JSON.stringify(luaParams)
) as string;

const resultJson = JSON.parse(result);

console.log("\n=== LUA LOGS ===");
if (resultJson.logs) {
  for (const log of resultJson.logs) {
    console.log(log);
  }
}

console.log("\n=== RESULT ===");
console.log("Updates:", JSON.stringify(resultJson.updates, null, 2));
console.log("Remaining:", resultJson.remaining);

// Cleanup
await redis.del(testKey);
await redis.quit();
