import express, { Router } from "express";
import { FeatureService } from "./FeatureService.js";
import { toAPIFeature } from "./utils/mapFeatureUtils.js";
import { APIFeatureSchema } from "@autumn/shared";

export const featureRouter: Router = express.Router();

// 1. Get features...
featureRouter.get("", async (req: any, res: any) => {
  let features = await FeatureService.getFromReq(req);
  res
    .status(200)
    .json({ list: features.map((feature) => toAPIFeature({ feature })) });
});

featureRouter.post("", async (req: any, res: any) => {
  let apiFeature = APIFeatureSchema.parse(req.body);
  // let feature = fromAPIFeature
  //   .status(200)
  //   .json({ list: features.map((feature) => toAPIFeature({ feature })) });
});
