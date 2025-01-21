import { Router } from "express";

import { EntitlementService } from "./EntitlementService.js";
import { Entitlement, EntitlementSchema } from "@autumn/shared";
import { generateId } from "@/utils/genUtils.js";
import { ProductService } from "./ProductService.js";

export const entitlementRouter = Router();

entitlementRouter.post("/:productId/entitlements", async (req: any, res) => {
  const { productId } = req.params;
  const data = req.body;

  try {
    await ProductService.getProductStrict({
      sb: req.sb,
      productId,
      orgId: req.org.id,
      env: req.env,
    });

    const entitlement: Entitlement = {
      id: generateId("ent"),
      org_id: req.org.id,
      product_id: productId,
      created_at: Date.now(),
      ...data,
    };

    await EntitlementService.createEntitlement(req.sb, entitlement);

    res.status(200).json({ message: "Entitlement created" });
  } catch (error: any) {
    console.log("Failed to create entitlement:", error);
    res.status(500).json({ message: "Failed to create entitlement" });
  }
});
