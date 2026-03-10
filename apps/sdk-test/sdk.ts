import { Autumn } from "autumn-js";

const autumn = new Autumn({
  secretKey: "am_sk_test_enFqfiGJBWr24b3Gx6mDNQkuHvNAcHIWIvXeis6HLf",
});

const res = await autumn.customers.getOrCreate({
  customerId: "john",
});

await autumn.entities.create({
  name: "Deployment 1",
  customerId: "john",
  entityId: "deployment_1",
  featureId: "DEPLOYMENTS",
});

await autumn.billing.attach({
  customerId: "john",
  entityId: "deployment_1",
  planId: "hobby",
});

console.log(JSON.stringify(res, null, 2));
