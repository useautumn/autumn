import { Hono } from "hono";
import type { HonoEnv } from "../../honoUtils/HonoEnv";
import { handleCreateFeature } from "./handlers/handleCreateFeature";
import { handleDeleteFeature } from "./handlers/handleDeleteFeature";
import { handleGetFeature } from "./handlers/handleGetFeature";
import { handleListFeatures } from "./handlers/handleListFeatures";
import { handleUpdateFeature } from "./handlers/handleUpdateFeature";
import { handleGetFeatureDeletionInfo } from "./internalHandlers/handleGetFeatureDeletionInfo";

export const featureRouter = new Hono<HonoEnv>();
featureRouter.get("", ...handleListFeatures);
featureRouter.post("", ...handleCreateFeature);
featureRouter.get("/:feature_id", ...handleGetFeature);
featureRouter.post("/:feature_id", ...handleUpdateFeature);
featureRouter.delete("/:feature_id", ...handleDeleteFeature);

featureRouter.get(
	"/:feature_id/deletion_info",
	...handleGetFeatureDeletionInfo,
);
