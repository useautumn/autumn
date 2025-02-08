import { ErrCode } from "@/errors/errCodes.js";
import { EntitlementService } from "@/internal/products/entitlements/EntitlementService.js";
import { ProductService } from "@/internal/products/ProductService.js";
import RecaseError from "@/utils/errorUtils.js";
import { generateId } from "@/utils/genUtils.js";
import { Entitlement } from "@autumn/shared";
import { Router } from "express";
import { StatusCodes } from "http-status-codes";

export const entitlementApiRouter = Router();

entitlementApiRouter.post("", async (req: any, res) => {
  const data = req.body;
  const { product_id } = data;

  try {
    const product = await ProductService.getProductStrict({
      sb: req.sb,
      productId: product_id,
      orgId: req.orgId,
      env: req.env,
    });

    if (!product) {
      throw new RecaseError({
        message: `Product ${product_id} not found`,
        code: ErrCode.ProductNotFound,
        statusCode: StatusCodes.NOT_FOUND,
      });
    }

    const entitlement: Entitlement = {
      id: generateId("ent"),
      org_id: req.orgId,
      product_id: product_id,
      created_at: Date.now(),
      ...data,
    };

    await EntitlementService.createEntitlement(req.sb, entitlement);

    res.status(200).json({ message: "Entitlement created" });
  } catch (error: any) {
    if (error instanceof RecaseError) {
      // error.print();
      res.status(error.statusCode).json({
        code: error.code,
        message: error.message,
      });
    } else {
      console.log("Failed to create entitlement:", error);
      res.status(500).json({ message: "Failed to create entitlement" });
    }
  }
});
