import { Router } from "express";
import { OrgService } from "../orgs/OrgService.js";
import { AppEnv } from "@autumn/shared";
import { ProductService } from "../products/ProductService.js";

export const publicRouter = Router();

const publicRouterMiddleware = async (req: any, res: any, next: any) => {
  const pkey = req.headers["x-publishable-key"];

  if (!pkey) {
    return res.status(400).json({ message: "Publishable key is required" });
  }

  if (!pkey.startsWith("am_pk_test") && !pkey.startsWith("am_pk_prod")) {
    return res.status(400).json({ message: "Invalid publishable key" });
  }

  let env: AppEnv = pkey.startsWith("am_pk_test")
    ? AppEnv.Sandbox
    : AppEnv.Live;

  // 2. Get orgId from publishable key
  const org = await OrgService.getFromPkey({
    sb: req.sb,
    pkey: pkey,
    env: env,
  });

  if (!org) {
    return res.status(400).json({ message: "Invalid publishable key" });
  }

  req.org = org;
  req.env = env;

  next();
};

publicRouter.use(publicRouterMiddleware);

publicRouter.get("/products", async (req: any, res: any) => {
  console.log("Org:", req.org.slug)
  const products = await ProductService.getFullProducts(
    req.sb,
    req.org.id,
    req.env
  );

  res.status(200).json(products);
});
