import { ErrCode } from "@/errors/errCodes.js";
import { PriceService } from "@/internal/prices/PriceService.js";
import { getBillingType } from "@/internal/prices/priceUtils.js";
import { ProductService } from "@/internal/products/ProductService.js";
import RecaseError, { formatZodError } from "@/utils/errorUtils.js";
import { generateId } from "@/utils/genUtils.js";
import { BillingType, Price, PriceSchema } from "@autumn/shared";
import { Router } from "express";

export const priceRouter = Router();

const cleanUpPrice = (price: Price) => {
  if (price.billing_type == BillingType.UsageBelowThreshold) {
    delete price.config?.interval;
  }

  return price;
};

priceRouter.post("", async (req: any, res) => {
  try {
    // 1. Create price and parse
    const data = req.body;

    let price: Price = {
      ...data,
      id: generateId("pr"),
      org_id: req.org.id,
      created_at: Date.now(),
      billing_type: getBillingType(data.config),
    };
    price = cleanUpPrice(price);

    // 1. Check if product is default
    // const product = await ProductService.get(req.sb, price.product_id!);
    // if (!product) {
    //   throw new RecaseError({
    //     message: "Product not found",
    //     code: ErrCode.ProductNotFound,
    //     statusCode: 404,
    //   });
    // }

    // if (product.is_default) {
    //   throw new RecaseError({
    //     message: "Default product should be free",
    //     code: ErrCode.DefaultProductNotAllowedPrice,
    //     statusCode: 400,
    //   });
    // }

    // 2. Validate the price
    try {
      price = PriceSchema.parse(price);
    } catch (error: any) {
      throw new RecaseError({
        message: "Failed to parse price: " + formatZodError(error),
        code: ErrCode.InvalidPrice,
        statusCode: 400,
        data: error,
      });
    }

    // 3. Insert price
    await PriceService.insert({
      sb: req.sb,
      data: price,
    });

    res.status(200).json({ success: true });
  } catch (error) {
    if (error instanceof RecaseError) {
      error.print();
      res
        .status(error.statusCode)
        .json({ message: error.message, code: error.code });
      return;
    }

    console.log("Unknown error, failed to create price", error);
    res.status(500).json({ message: "Failed to create price" });
    return;
  }
});

priceRouter.delete("/:price_id", async (req: any, res) => {
  const { price_id } = req.params;

  try {
    await PriceService.deletePriceStrict({
      sb: req.sb,
      priceId: price_id,
      orgId: req.org.id,
      env: req.env,
    });
    res.status(200).json({ message: "Price deleted successfully" });
  } catch (error) {
    console.log("Failed to delete price", error);

    if (error instanceof RecaseError) {
      res.status(404).json({ message: error.message, code: error.code });
      return;
    }

    res.status(500).json({ message: "Failed to delete price" });
    return;
  }
});
