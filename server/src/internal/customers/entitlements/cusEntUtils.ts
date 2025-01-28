import { Client } from "pg";

export const getFeatureBalance = async ({
  pg,
  customerId,
  featureId,
  orgId,
}: {
  pg: Client;
  customerId: string;
  featureId: string;
  orgId: string;
}) => {
  const { rows } = await pg.query(
    `
    select sum(balance) from customer_entitlements ce  JOIN 
    customer_products cp on ce.customer_product_id = cp.id

    where org_id = $1
    and customer_id = $2
    and feature_id = $3
    and cp.status = 'active'
  `,
    [orgId, customerId, featureId]
  );

  if (rows.length === 0) {
    return null;
  }

  return parseFloat(rows[0].sum);
};
