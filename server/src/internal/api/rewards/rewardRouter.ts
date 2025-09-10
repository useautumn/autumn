import express, { type Router } from "express";
import { handleCreateCoupon, handleDeleteCoupon, handleGetCoupon, handleUpdateCoupon } from "./handlers/rewards/index.js";

const rewardRouter: Router = express.Router();

rewardRouter.post("", handleCreateCoupon);

rewardRouter.delete("/:id", handleDeleteCoupon);

rewardRouter.post("/:internalId", handleUpdateCoupon);

rewardRouter.get("/:id", handleGetCoupon);

export default rewardRouter;