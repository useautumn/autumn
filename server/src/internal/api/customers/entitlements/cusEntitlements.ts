import { Router } from "express";

export const customerEntitlementsRouter = Router();

customerEntitlementsRouter.post("/is_allowed", async (req: any, res: any) => {
  console.log("is_allowed: ", req.body);
  const { customer_id, feature_id } = req.body;

  const { rows } = await req.pg.query(`
select * from features WHERE EXISTS (
  SELECT 1 FROM jsonb_array_elements(config->'schema') as schema_element WHERE
  org_id = ${req.orgId} AND
  schema_element->>'metered_feature_id' = ${feature_id}
)
  `);

  console.log(rows);

  const isAllowed = true;

  res.json({ is_allowed: isAllowed });
});
