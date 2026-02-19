import { Hono } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { handleCreatePlanV2 } from "./handlers/handleCreateProduct/handleCreatePlanV2.js";
import { handleDeletePlanV2 } from "./handlers/handleDeletePlan/handleDeletePlanV2.js";
import { handleGetPlanV2 } from "./handlers/handleGetProduct/handleGetPlanV2.js";
import { handleUpdatePlanV2 } from "./handlers/handleUpdateProduct/handleUpdatePlanV2.js";

export const planRpcRouter = new Hono<HonoEnv>();

planRpcRouter.post("/plans.create", ...handleCreatePlanV2);
planRpcRouter.post("/plans.get", ...handleGetPlanV2);
planRpcRouter.post("/plans.update", ...handleUpdatePlanV2);
planRpcRouter.post("/plans.delete", ...handleDeletePlanV2);
