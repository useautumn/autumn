import { Router } from "express";
import { FeatureService } from "../features/FeatureService.js";
import { entitlementRouter } from "./entitlementRouter.js";
import { PriceService } from "../prices/PriceService.js";
import { ProductService } from "./ProductService.js";

export const productRouter = Router({ mergeParams: true });

productRouter.get("/data", async (req: any, res) => {
  let sb = req.sb;

  try {
    const products = await ProductService.getProducts(sb, req.org.id, req.env);

    const features = await FeatureService.getFeatures({
      sb,
      orgId: req.org.id,
      env: req.env,
    });

    res.status(200).json({ products, features });
  } catch (error) {
    console.error("Failed to get products", error);
    res.status(500).send(error);
  }
});

// Get stripe products

productRouter.get("/:productId/data", async (req: any, res) => {
  const { productId } = req.params;
  const sb = req.sb;
  const orgId = req.org.id;
  const env = req.env;

  try {
    const product = await ProductService.getFullProductStrict({
      sb,
      productId,
      orgId,
      env,
    });

    let entitlements = product.entitlements;
    let prices = product.prices;

    const features = await FeatureService.getFeatures({
      sb,
      orgId,
      env,
    });

    res.status(200).send({ product, entitlements, prices, features });
  } catch (error) {
    console.error("Failed to get products", error);
    res.status(500).send(error);
  }
});

// Individual Product routes
productRouter.get("/:productId", async (req: any, res) => {
  const { productId } = req.params;
  try {
    const Product = await ProductService.getProductStrict({
      sb: req.sb,
      productId,
      orgId: req.org.id,
      env: req.env,
    });

    const entitlements = await ProductService.getEntitlementsByProductId(
      req.sb,
      productId
    );

    const prices = await PriceService.getPricesByProductId(req.sb, productId);

    res.status(200).send({ Product, entitlements, prices });
  } catch (error) {
    console.log("Failed to get Product", error);
    res.status(404).send("Product not found");
    return;
  }
});

productRouter.use(entitlementRouter);
