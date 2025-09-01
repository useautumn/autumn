import {
	CreateFeatureSchema,
	ErrCode,
	entitlements,
	FeatureType,
	products,
} from "@autumn/shared";
import { and, eq, sql } from "drizzle-orm";
import express, { type Router } from "express";
import { handleDeleteFeature } from "@/internal/features/handlers/handleDeleteFeature.js";
import { handleUpdateFeature } from "@/internal/features/handlers/handleUpdateFeature.js";
import RecaseError, { formatZodError } from "@/utils/errorUtils.js";
import { generateId } from "@/utils/genUtils.js";
import { FeatureService } from "./FeatureService.js";
import {
	validateCreditSystem,
	validateFeatureId,
	validateMeteredConfig,
} from "./featureUtils.js";
import { handleCreateFeature } from "./handlers/handleCreateFeature.js";

export const internalFeatureRouter: Router = express.Router();

internalFeatureRouter.get("", async (req: any, res: any) => {
	try {
		const { showArchived } = req.query;

		if (showArchived !== undefined) {
			// If showArchived is specified, use FeatureService.list with the parameter
			const features = await FeatureService.list({
				db: req.db,
				orgId: req.orgId,
				env: req.env,
				archived: showArchived === "true",
			});
			res.status(200).json({ features });
		} else {
			// If no showArchived parameter, use the original getFromReq method
			const features = await FeatureService.getFromReq(req);
			res.status(200).json({ features });
		}
	} catch (error: any) {
		console.log("Error fetching features:", error);
		res.status(500).json({ error: error.message });
	}
});

export const validateFeature = (data: any) => {
	const featureType = data.type;

	validateFeatureId(data.id);

	let config = data.config;
	if (featureType === FeatureType.Metered) {
		config = validateMeteredConfig(config);
	} else if (featureType === FeatureType.CreditSystem) {
		config = validateCreditSystem(config);
	}

	try {
		const parsedFeature = CreateFeatureSchema.parse({ ...data, config });
		return parsedFeature;
	} catch (error: any) {
		throw new RecaseError({
			message: `Invalid feature: ${formatZodError(error)}`,
			code: ErrCode.InvalidFeature,
			statusCode: 400,
		});
	}
};

export const initNewFeature = ({
	data,
	orgId,
	env,
}: {
	data: any;
	orgId: string;
	env: any;
}) => {
	return {
		...data,
		org_id: orgId,
		env,
		created_at: Date.now(),
		internal_id: generateId("fe"),
	};
};

internalFeatureRouter.post("", handleCreateFeature);

internalFeatureRouter.get(
	"/data/deletion_text/:feature_id",
	async (req: any, res) => {
		try {
			const { db } = req;
			const { feature_id } = req.params;

			// Get the feature first
			const feature = await FeatureService.get({
				db,
				id: feature_id,
				orgId: req.orgId,
				env: req.env,
			});

			if (!feature) {
				return res.status(404).json({ error: "Feature not found" });
			}

			// Use Drizzle query similar to ProductService.getDeletionText
			const res_data = await db
				.select({
					productName: sql<string>`CASE WHEN ROW_NUMBER() OVER (ORDER BY ${products.created_at}) = 1 THEN ${products.name ?? "Product name not found"} ELSE NULL END`,
					totalCount: sql<number>`COUNT(*) OVER ()`,
				})
				.from(products)
				.innerJoin(
					entitlements,
					eq(products.internal_id, entitlements.internal_product_id),
				)
				.where(
					and(
						eq(entitlements.internal_feature_id, feature.internal_id!),
						eq(products.env, req.env),
						eq(products.org_id, req.orgId),
					),
				)
				.limit(1);

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
		} catch (error) {
			console.error("Failed to get feature deletion text", error);
			res.status(500).send(error);
		}
	},
);

internalFeatureRouter.post("/:feature_id", handleUpdateFeature);
internalFeatureRouter.delete("/:featureId", handleDeleteFeature);
