import { Hono } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { handleCreateFeatureRpc } from "./handlers/rpc/handleCreateFeatureRpc.js";
import { handleDeleteFeatureRpc } from "./handlers/rpc/handleDeleteFeatureRpc.js";
import { handleGetFeatureRpc } from "./handlers/rpc/handleGetFeatureRpc.js";
import { handleListFeaturesRpc } from "./handlers/rpc/handleListFeaturesRpc.js";
import { handleUpdateFeatureRpc } from "./handlers/rpc/handleUpdateFeatureRpc.js";

export const featureRpcRouter = new Hono<HonoEnv>();

featureRpcRouter.post("/features.list", ...handleListFeaturesRpc);
featureRpcRouter.post("/features.get", ...handleGetFeatureRpc);
featureRpcRouter.post("/features.create", ...handleCreateFeatureRpc);
featureRpcRouter.post("/features.update", ...handleUpdateFeatureRpc);
featureRpcRouter.post("/features.delete", ...handleDeleteFeatureRpc);
