import { Hono } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import {
	handleCreateCoupon,
	handleDeleteCoupon,
	handleGetCoupon,
	handleUpdateCoupon,
} from "./handlers/rewards/index.js";

export const rewardRouter = new Hono<HonoEnv>();

rewardRouter.post("", ...handleCreateCoupon);
rewardRouter.delete("/:id", ...handleDeleteCoupon);
rewardRouter.post("/:internalId", ...handleUpdateCoupon);
rewardRouter.get("/:id", ...handleGetCoupon);
