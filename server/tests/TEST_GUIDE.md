# Test Writing Guide

## Initial Notes (To be organized later)

### Customer Initialization

#### Default Products
- For tests involving default products, use the `withDefault: true` flag in `initCustomerV3()`
- This ensures the customer is created with the default product attached
- Example:
  ```typescript
  await initCustomerV3({
    ctx,
    customerId,
    customerData: { fingerprint: "test" },
    withTestClock: false,
    withDefault: true, // Attach default product on creation
  });
  ```

#### Fingerprint
- For tests involving fingerprint, pass in `fingerprint` through `customerData` in `initCustomerV3()`
- Example:
  ```typescript
  await initCustomerV3({
    ctx,
    customerId,
    customerData: { fingerprint: "test" }, // Pass fingerprint here
    withTestClock: false,
  });
  ```
