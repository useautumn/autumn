import { ErrCode } from "@autumn/shared";
import { getCreditSystemsFromFeature } from "@/internal/features/creditSystemUtils.js";
import { FeatureService } from "@/internal/features/FeatureService.js";
import { EntitlementService } from "@/internal/products/entitlements/EntitlementService.js";
import RecaseError from "@/utils/errorUtils.js";
import type {
	ExtendedRequest,
	ExtendedResponse,
} from "@/utils/models/Request.js";
import { routeHandler } from "@/utils/routerUtils.js";

export const handleDeleteFeature = async (req: any, res: any) =>
	routeHandler({
		req,
		res,
		action: "Delete feature",
		handler: async (req: ExtendedRequest, res: ExtendedResponse) => {
			const { db, orgId } = req;

			const { featureId } = req.params;
			const features = await FeatureService.getFromReq(req);
			const feature = features.find((f) => f.id === featureId);
			const creditSystems = getCreditSystemsFromFeature({
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
			const ent = await EntitlementService.getByFeature({
				db,
				internalFeatureId: feature.internal_id!,
			});

			if (ent) {
				throw new RecaseError({
					message: `Feature ${featureId} is used in a product. You must delete the product first, or archive it instead.`,
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
