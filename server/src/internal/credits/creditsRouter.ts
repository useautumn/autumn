import express from "express";
import { generateId } from "@/utils/genUtils.js";
import { getFeaturesByOrg } from "../features/featureCrud.js";
import { CreditService } from "./CreditService.js";
import { CreditSystem } from "@autumn/shared";

export const creditsRouter = express.Router();

creditsRouter.get("", async (req: any, res) => {
  let org = req.org;

  try {
    let features = await getFeaturesByOrg(org.id);
    let creditSystems = await CreditService.getByOrg(req.sb, org.id);

    res.status(200).json({ features, credit_systems: creditSystems });
  } catch (error: any) {
    console.log("Error fetching features:", error);
    res.status(500).json({ error: error.message });
  }
});

creditsRouter.post("/systems", async (req: any, res) => {
  let org = req.org;
  let data = req.body;

  try {
    let creditSystem: CreditSystem = {
      internal_id: generateId("cs"),
      org_id: org.id,
      created_at: Date.now(),
      ...data,
    };

    await CreditService.insert(req.sb, creditSystem);
    console.log("Successfully inserted credit system into DB");
    res.status(200).json({ message: "Credit system created" });
  } catch (error: any) {
    console.log("Error inserting credit system into DB:", error);
    res.status(500).json({ error: error.message });
  }
});
