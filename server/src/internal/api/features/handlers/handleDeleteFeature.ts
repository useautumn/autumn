import { ErrCode } from "@/errors/errCodes.js";
import { getCreditSystemsFromFeature } from "@/internal/features/creditSystemUtils.js";
import { FeatureService } from "@/internal/features/FeatureService.js";
import { EntitlementService } from "@/internal/products/entitlements/EntitlementService.js";
import RecaseError from "@/utils/errorUtils.js";
import { ExtendedRequest, ExtendedResponse } from "@/utils/models/Request.js";
import { routeHandler } from "@/utils/routerUtils.js";

export const handleDeleteFeature = async (req: any, res: any) =>
  routeHandler({
    req,
    res,
    action: "Delete feature",
    handler: async (req: ExtendedRequest, res: ExtendedResponse) => {
      const { db, sb, orgId, env } = req;

      let { featureId } = req.params;
      let features = await FeatureService.getFromReq(req);
      let feature = features.find((f) => f.id === featureId);
      let creditSystems = getCreditSystemsFromFeature({
        featureId,
        features,
      });

      if (!feature) {
        throw new RecaseError({
          message: `Feature ${featureId} not found`,
          code: ErrCode.FeatureNotFound,
          statusCode: 404,
        });
      }

      if (creditSystems.length > 0) {
        throw new RecaseError({
          message: `Feature ${featureId} is used by credit system ${creditSystems[0].id}`,
          code: ErrCode.InvalidFeature,
          statusCode: 400,
        });
      }

      // Get prices that use this feature
      const ents: any[] = await EntitlementService.getByFeature({
        sb: req.sb,
        orgId,
        internalFeatureId: feature.internal_id!,
        env: req.env,
        withProduct: true,
      });

      if (ents.length > 0) {
        throw new RecaseError({
          message: `Feature ${featureId} is used in ${ents[0].product.name}`,
          code: ErrCode.InvalidFeature,
          statusCode: 400,
        });
      }

      await FeatureService.delete({
        db: req.db,
        orgId,
        featureId,
        env: req.env,
      });

      res.status(200).json({ message: "Feature deleted" });
    },
  });
