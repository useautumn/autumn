import express, { type Router } from "express";
import { handleCreateRewardProgram, handleDeleteRewardProgram } from "./handlers/referrals/index.js";

export const rewardProgramRouter: Router = express.Router();

rewardProgramRouter.post("", handleCreateRewardProgram);

rewardProgramRouter.delete("/:id", handleDeleteRewardProgram);