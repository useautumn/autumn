// @ts-nocheck

await autumn.customerProducts.create({
  customer_id: "",
  product_id: "pro",
})

await autumn.customerLicenses.create({
  customer_id: "",
  product_id: "pro",
  quantity: 5,
  license_to: ["ent_1"]
})

