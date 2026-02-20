import { Hono } from "hono";
import type { HonoEnv } from "../../honoUtils/HonoEnv";
import { handleCreateFeatureV1 } from "./handlers/handleCreateFeature/handleCreateFeatureV1";
import { handleCreateFeatureV2 } from "./handlers/handleCreateFeature/handleCreateFeatureV2";
import { handleDeleteFeatureV1 } from "./handlers/handleDeleteFeature/handleDeleteFeatureV1";
import { handleDeleteFeatureV2 } from "./handlers/handleDeleteFeature/handleDeleteFeatureV2";
import { handleGetFeatureV1 } from "./handlers/handleGetFeature/handleGetFeatureV1";
import { handleGetFeatureV2 } from "./handlers/handleGetFeature/handleGetFeatureV2";
import { handleListFeaturesV1 } from "./handlers/handleListFeatures/handleListFeaturesV1";
import { handleUpdateFeatureV1 } from "./handlers/handleUpdateFeature/handleUpdateFeatureV1";
import { handleUpdateFeatureV2 } from "./handlers/handleUpdateFeature/handleUpdateFeatureV2";
import { handleGetFeatureDeletionInfo } from "./internalHandlers/handleGetFeatureDeletionInfo";

export const featureRouter = new Hono<HonoEnv>();
featureRouter.get("", ...handleListFeaturesV1);
featureRouter.post("", ...handleCreateFeatureV1);
featureRouter.get("/:feature_id", ...handleGetFeatureV1);
featureRouter.post("/:feature_id", ...handleUpdateFeatureV1);
featureRouter.delete("/:feature_id", ...handleDeleteFeatureV1);

featureRouter.get(
	"/:feature_id/deletion_info",
	...handleGetFeatureDeletionInfo,
);

export const featureRpcRouter = new Hono<HonoEnv>();
featureRpcRouter.post("/features.list", ...handleListFeaturesV1);
featureRpcRouter.post("/features.get", ...handleGetFeatureV2);
featureRpcRouter.post("/features.create", ...handleCreateFeatureV2);
featureRpcRouter.post("/features.update", ...handleUpdateFeatureV2);
featureRpcRouter.post("/features.delete", ...handleDeleteFeatureV2);
