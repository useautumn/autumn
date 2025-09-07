import { ExtendedRequest, ExtendedResponse } from "@/utils/models/Request.js";
import { and, eq, sql } from "drizzle-orm";
import { FeatureService } from "../FeatureService.js";
import { entitlements, products } from "@autumn/shared";
import { routeHandler } from "@/utils/routerUtils.js";

export const handleGetFeatureDeletionInfo = async (req: any, res: any) =>
  routeHandler({
    req,
    res,
    action: "Get feature deletion info",
    handler: async (req: any, res: any) => {
      let { db } = req;
      let { feature_id } = req.params;

      let feature = await FeatureService.get({
        db,
        id: feature_id,
        orgId: req.orgId,
        env: req.env,
      });

      if (!feature) {
        return res.status(404).json({ error: "Feature not found" });
      }

      // Use Drizzle query similar to ProductService.getDeletionText
      let res_data = await db
        .select({
          productName: sql<string>`CASE WHEN ROW_NUMBER() OVER (ORDER BY ${products.created_at}) = 1 THEN ${products.name ?? "Product name not found"} ELSE NULL END`,
          totalCount: sql<number>`COUNT(*) OVER ()`,
        })
        .from(products)
        .innerJoin(
          entitlements,
          eq(products.internal_id, entitlements.internal_product_id)
        )
        .where(
          and(
            eq(entitlements.internal_feature_id, feature.internal_id!),
            eq(products.env, req.env),
            eq(products.org_id, req.orgId)
          )
        )
        .limit(1);

      console.log(
        `Feature ${feature_id} has ${res_data.length} products. First product name: ${res_data[0]?.productName}`
      );

      // If no products found, return explicit zero count
      if (!res_data || res_data.length === 0) {
        res.status(200).json({
          productName: null,
          totalCount: 0,
        });
      } else {
        res.status(200).json({
          productName: res_data[0]?.productName || null,
          totalCount: Number(res_data[0]?.totalCount) || 0,
        });
      }
    },
  });
