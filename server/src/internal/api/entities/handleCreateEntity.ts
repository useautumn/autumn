import { CusService } from "@/internal/customers/CusService.js";
import { FeatureService } from "@/internal/features/FeatureService.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { handleRequestError } from "@/utils/errorUtils.js";
import {
  CreateEntitySchema,
  EntitySchema,
} from "@shared/models/cusModels/entityModels/entityModels.js";
import { z } from "zod";

export const handleCreateEntity = async (req: any, res: any) => {
  try {
    // Create entity!

    let data = req.body;
    let createEntites: any[] = Array.isArray(data) ? data : [data];
    const { sb, env, orgId } = req;

    // 1. Parse entities
    const parsedEntities = z.array(CreateEntitySchema).parse(createEntites);

    console.log("Parsed entities:", parsedEntities);
    let cusIds = parsedEntities.map((entity) => entity.customer_id);

    let [customers, features, org] = await Promise.all([
      CusService.getInIds({ cusIds, orgId, env, sb }),
      FeatureService.getFromReq(req),
      OrgService.getFromReq(req),
    ]);

    // 2. For each entity

    res.status(200).json({
      success: true,
    });
  } catch (error) {
    handleRequestError({ error, req, res, action: "create entity" });
  }
};
