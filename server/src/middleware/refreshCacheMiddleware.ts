const urls = [
  {
    method: "POST",
    url: "/customers/:customer_id",
  },
  {
    method: "DELETE",
    url: "/customers/:customer_id",
  },
  {
    method: "POST",
    url: "/customers/:customer_id/balances",
  },
  {
    method: "POST",
    url: "/customers/customer_entitlements/:customer_entitlement_id",
  },
  {
    method: "POST",
    url: "/customers/:customer_id/balances",
  },
  {
    method: "POST",
    url: "/customers/:customer_id/coupons/:coupon_id",
  },
  {
    method: "POST",
    url: "/customers/:customer_id/entities",
  },
  {
    method: "POST",
    url: "/customers/:customer_id/transfer_product",
  },
  {
    method: "POST",
    url: "/attach",
  },
];
export const refreshCacheMiddleware = async (req: any, res: any, next: any) => {
  res.on("finish", async () => {
    console.log("URL:", req.originalUrl);
    console.log("METHOD:", req.method);
    console.log("--------------------------------");
  });

  next();
};
