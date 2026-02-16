<!-- Start SDK Example Usage [usage] -->
```typescript
import { Autumn } from "@useautumn/sdk";

const autumn = new Autumn({
  xApiVersion: "2.1",
  secretKey: process.env["AUTUMN_SECRET_KEY"] ?? "",
});

async function run() {
  const result = await autumn.customers.getOrCreate({
    customerId: null,
  });

  console.log(result);
}

run();

```
<!-- End SDK Example Usage [usage] -->