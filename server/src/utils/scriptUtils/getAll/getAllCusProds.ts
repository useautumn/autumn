import { AppEnv, type FullCusProduct } from "@autumn/shared";
import { sql } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";

const cusProductsQuery = ({
	lastProductId,
	internalProductId,
	pageSize = 250,
}: {
	lastProductId?: string;
	internalProductId?: string;
	pageSize?: number;
}) => {
	// const withStatusFilter = () => {
	//   return inStatuses
	//     ? sql`AND cp.status = ANY(ARRAY[${sql.join(
	//         inStatuses.map((status) => sql`${status}`),
	//         sql`, `,
	//       )}])`
	//     : sql``;
	// };

	return sql`
    SELECT 
        cp.*,
        row_to_json(prod) AS product,
        
        -- Spread customer_prices fields + add price field
        COALESCE(
          json_agg(DISTINCT (
            to_jsonb(cpr.*) || jsonb_build_object('price', to_jsonb(p.*))
          )) FILTER (WHERE cpr.id IS NOT NULL),
          '[]'::json
        ) AS customer_prices,
        
        -- Spread customer_entitlements fields + add entitlement and replaceables
        COALESCE(
          json_agg(DISTINCT (
            to_jsonb(ce.*) || jsonb_build_object(
              'entitlement', (
                SELECT row_to_json(ent_with_feature)
                FROM (
                  SELECT e.*, row_to_json(f) AS feature
                  FROM entitlements e
                  JOIN features f ON e.internal_feature_id = f.internal_id
                  WHERE e.id = ce.entitlement_id
                ) AS ent_with_feature
              ),
              'replaceables', (
                SELECT COALESCE(
                  json_agg(row_to_json(r)) FILTER (WHERE r.id IS NOT NULL),
                  '[]'::json
                )
                FROM replaceables r
                WHERE r.cus_ent_id = ce.id
              )
            )
          )) FILTER (WHERE ce.id IS NOT NULL),
          '[]'::json
        ) AS customer_entitlements,
        
        -- free_trial
        (
          SELECT row_to_json(ft)
          FROM free_trials ft
          WHERE ft.id = cp.free_trial_id
        ) AS free_trial

      FROM customer_products cp
      JOIN products prod ON cp.internal_product_id = prod.internal_id
      LEFT JOIN customer_prices cpr ON cpr.customer_product_id = cp.id
      LEFT JOIN prices p ON cpr.price_id = p.id
      LEFT JOIN customer_entitlements ce ON ce.customer_product_id = cp.id
      WHERE cp.internal_product_id = ${internalProductId}
      ${lastProductId ? sql`AND cp.id < ${lastProductId}` : sql``}
      GROUP BY cp.id, prod.*
      ORDER BY cp.id DESC
      LIMIT ${pageSize}
  `;
};

export const getAllFullCusProducts = async ({
	db,
	internalProductId,
}: {
	db: DrizzleCli;
	internalProductId: string;
}) => {
	let lastProductId = "";
	const allData: any[] = [];
	const pageSize = 500;

	while (true) {
		const data = await db.execute(
			cusProductsQuery({
				lastProductId,
				pageSize,
				internalProductId,
			}),
		);

		if (data.length === 0) break;

		console.log(`Fetched ${data.length} customer products`);
		allData.push(...data);
		lastProductId = data[data.length - 1].id as string;
	}

	return allData as FullCusProduct[];
};
