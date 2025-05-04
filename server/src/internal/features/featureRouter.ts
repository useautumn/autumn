import express from "express";

import { FeatureService } from "./FeatureService.js";

export const featureRouter = express.Router();

featureRouter.get("", async (req: any, res) => {
  let orgId = req.orgId;
  let env = req.env;
  try {
    let features = await FeatureService.getFeatures({
      sb: req.sb,
      orgId: orgId,
      env: env,
    });
    // let dbConns = await DBConnService.getByOrg(orgId);

    res.status(200).json({ features });
  } catch (error: any) {
    console.log("Error fetching features:", error);
    res.status(500).json({ error: error.message });
  }
});
