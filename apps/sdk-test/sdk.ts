import { Autumn } from "autumn-js";

const autumn = new Autumn({
  secretKey: "am_sk_test_enFqfiGJBWr24b3Gx6mDNQkuHvNAcHIWIvXeis6HLf",
});

const res = await autumn.customers.getOrCreate({
  customerId: "john",
});

await autumn.billing.update({
  customerId: "john",
  noBillingChanges: true,
});

console.log(JSON.stringify(res, null, 2));
