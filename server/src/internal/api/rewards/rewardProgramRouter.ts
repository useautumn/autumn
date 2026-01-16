import { Hono } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import {
	handleCreateRewardProgram,
	handleDeleteRewardProgram,
	handleUpdateRewardProgram,
} from "./handlers/rewardPrograms/index.js";

export const rewardProgramRouter = new Hono<HonoEnv>();

rewardProgramRouter.post("", ...handleCreateRewardProgram);
rewardProgramRouter.delete("/:id", ...handleDeleteRewardProgram);
rewardProgramRouter.put("/:id", ...handleUpdateRewardProgram);
