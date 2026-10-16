import { Hono } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { declareApprovalAction } from "@/internal/approvals/enforce/access/declareApprovalAction.js";
import {
	handleCreateCoupon,
	handleDeleteCoupon,
	handleGetCoupon,
	handleUpdateCoupon,
} from "./handlers/rewards/index.js";

export const rewardRouter = new Hono<HonoEnv>();

rewardRouter.post(
	"",
	declareApprovalAction({ resolve: () => "rewards.create" }),
	...handleCreateCoupon,
);
rewardRouter.delete("/:id", ...handleDeleteCoupon);
rewardRouter.post("/:internalId", ...handleUpdateCoupon);
rewardRouter.get("/:id", ...handleGetCoupon);
