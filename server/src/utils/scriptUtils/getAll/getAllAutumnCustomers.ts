import {
	type AppEnv,
	type CusProductStatus,
	type Customer,
	customers,
	type Entity,
	entities,
	type FullCusProduct,
	type FullCustomer,
} from "@autumn/shared";
import { and, desc, eq, lt, sql } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { RELEVANT_STATUSES } from "@/internal/customers/cusProducts/CusProductService.js";

const cusProductsQuery = ({
	orgId,
	env,
	inStatuses = RELEVANT_STATUSES,
	internalIds,
	lastProductId,
	pageSize = 250,
}: {
	orgId: string;
	env: AppEnv;
	inStatuses?: CusProductStatus[];
	internalIds?: string[];
	lastProductId?: string;
	pageSize?: number;
}) => {
	const withStatusFilter = () => {
		return inStatuses
			? sql`AND cp.status = ANY(ARRAY[${sql.join(
					inStatuses.map((status) => sql`${status}`),
					sql`, `,
				)}])`
			: sql``;
	};

	const withInternalIdsFilter = () => {
		return internalIds && internalIds.length > 0
			? sql`AND cp.internal_customer_id = ANY(ARRAY[${sql.join(
					internalIds.map((id) => sql`${id}`),
					sql`, `,
				)}])`
			: sql``;
	};

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
      WHERE prod.org_id = ${orgId} AND prod.env = ${env}
      ${withStatusFilter()}
      ${withInternalIdsFilter()}
      ${lastProductId ? sql`AND cp.id < ${lastProductId}` : sql``}
      GROUP BY cp.id, prod.*
      ORDER BY cp.id DESC
      LIMIT ${pageSize}
  `;
};
export const getAllFullCusProducts = async ({
	db,
	orgId,
	env,
	inStatuses = RELEVANT_STATUSES,
	internalIds,
}: {
	db: DrizzleCli;
	orgId: string;
	env: AppEnv;
	inStatuses?: CusProductStatus[];
	internalIds?: string[];
}) => {
	let lastProductId = "";
	const allData: FullCusProduct[] = [];
	const pageSize = 500;

	while (true) {
		const data = (await db.execute(
			cusProductsQuery({
				orgId,
				env,
				inStatuses,
				internalIds,
				lastProductId,
				pageSize,
			}),
		)) as FullCusProduct[];

		if (data.length === 0) break;

		console.log(`Fetched ${data.length} customer products`);
		allData.push(...data);
		lastProductId = data[data.length - 1].id;
	}

	return allData;
};

export const getCustomerBatch = async ({
	db,
	orgId,
	env,
	lastCustomerId,
	pageSize = 500,
}: {
	db: DrizzleCli;
	orgId: string;
	env: AppEnv;
	lastCustomerId?: string;
	pageSize?: number;
}) => {
	const data = await db.query.customers.findMany({
		where: and(
			eq(customers.org_id, orgId),
			eq(customers.env, env),
			lastCustomerId ? lt(customers.internal_id, lastCustomerId) : undefined,
		),
		orderBy: [desc(customers.internal_id)],
		limit: pageSize,
	});

	return data as Customer[];
};

export const getAllCustomers = async ({
	db,
	orgId,
	env,
	internalIds,
}: {
	db: DrizzleCli;
	orgId: string;
	env: AppEnv;
	internalIds?: string[];
}) => {
	let lastCustomerId = "";
	const allData: Customer[] = [];
	const pageSize = 500;

	while (true) {
		const data = (await db.query.customers.findMany({
			where: and(
				eq(customers.org_id, orgId),
				eq(customers.env, env),
				internalIds && internalIds.length > 0
					? sql`${customers.internal_id} = ANY(ARRAY[${sql.join(
							internalIds.map((id) => sql`${id}`),
							sql`, `,
						)}])`
					: undefined,
				lastCustomerId ? lt(customers.internal_id, lastCustomerId) : undefined,
			),
			orderBy: [desc(customers.internal_id)],
			limit: pageSize,
		})) as Customer[];

		if (data.length === 0) break;

		console.log(`Fetched ${data.length} customers`);
		allData.push(...data);
		lastCustomerId = data[data.length - 1].internal_id;
	}

	return allData;
};

export const getAllFullCustomers = async ({
	db,
	orgId,
	env,
	internalIds,
}: {
	db: DrizzleCli;
	orgId: string;
	env: AppEnv;
	internalIds?: string[];
}) => {
	const [customers, fullCusProducts] = await Promise.all([
		getAllCustomers({ db, orgId, env, internalIds }),
		getAllFullCusProducts({ db, orgId, env, internalIds }),
	]);

	const cusProdMap: Record<string, FullCusProduct[]> = {};
	for (const cp of fullCusProducts) {
		const internalCusId = cp.internal_customer_id;
		if (!cusProdMap[internalCusId]) {
			cusProdMap[internalCusId] = [];
		}
		cusProdMap[internalCusId].push(cp);
	}

	return customers.map((customer) => {
		return {
			...customer,
			customer_products: cusProdMap[customer.internal_id] || [],
		};
	}) as FullCustomer[];
};

export const getAllEntities = async ({
	db,
	orgId,
	env,
}: {
	db: DrizzleCli;
	orgId: string;
	env: AppEnv;
}) => {
	let lastEntityId = "";
	const allData: Entity[] = [];
	const pageSize = 500;

	while (true) {
		const data = (await db.query.entities.findMany({
			where: and(
				eq(entities.org_id, orgId),
				eq(entities.env, env),
				lastEntityId ? lt(entities.internal_id, lastEntityId) : undefined,
			),
			orderBy: [desc(entities.internal_id)],
			limit: pageSize,
		})) as Entity[];

		if (data.length === 0) break;

		console.log(`Fetched ${data.length} entities`);
		allData.push(...data);
		lastEntityId = data[data.length - 1].internal_id;
	}

	return allData;
};
