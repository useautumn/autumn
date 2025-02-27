import express from "express";
import { DBConnService } from "./DBConnService.js";
import { generateId } from "@/utils/genUtils.js";

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

featureRouter.post("/db_connection", async (req: any, res) => {
  let orgId = req.orgId;

  let data = req.body;

  console.log("Creating DB Connection: ", data);

  try {
    let dbConn = await DBConnService.insert({
      id: generateId("conn"),
      org_id: orgId,
      provider: data.provider,
      display_name: data.display_name,
      connection_string: data.connection_string,
      created_at: Date.now(),
    });

    res.status(200).json(dbConn);
  } catch (error: any) {
    // console.log("Error creating DB connection:", error);
    res.status(500).json({ error: error.message });
  }
});
