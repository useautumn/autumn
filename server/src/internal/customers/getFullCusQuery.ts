import { AppEnv } from "@autumn/shared";
import { CusProductStatus } from "@autumn/shared";
import { sql, SQL } from "drizzle-orm";

const buildOptimizedCusProductsCTE = (inStatuses?: CusProductStatus[]) => {
	const withStatusFilter = () => {
		return inStatuses
			? sql`AND cp.status = ANY(ARRAY[${sql.join(
					inStatuses.map((status) => sql`${status}`),
					sql`, `
				)}])`
			: sql``;
	};

	return sql`
    customer_products_with_prices AS (
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
        
        -- Spread customer_entitlements fields + add entitlement, replaceables, and rollovers
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
              ),
              'rollovers', (
                SELECT COALESCE(
                  json_agg(row_to_json(ro) ORDER BY ro.expires_at ASC) FILTER (WHERE ro.expires_at > EXTRACT(EPOCH FROM now()) * 1000),
                  '[]'::json
                )
                FROM rollovers ro
                WHERE ro.cus_ent_id = ce.id
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
      WHERE cp.internal_customer_id = (SELECT internal_id FROM customer_record)
      ${withStatusFilter()}
      GROUP BY cp.id, prod.*
    )
  `;
};

const buildEntitiesCTE = (withEntities: boolean) => {
	if (!withEntities) {
		return sql``;
	}

	return sql`
    customer_entities AS (
      SELECT 
        COALESCE(
          json_agg(row_to_json(e) ORDER BY e.internal_id DESC),
          '[]'::json
        ) AS entities
      FROM entities e
      WHERE e.internal_customer_id = (SELECT internal_id FROM customer_record)
      LIMIT 100
    )
  `;
};

const buildEntityCTE = (entityId?: string) => {
	if (!entityId) {
		return sql``;
	}

	return sql`
    entity_record AS (
      SELECT * FROM entities e
      WHERE e.internal_customer_id = (SELECT internal_id FROM customer_record)
      AND (
        e.id = ${entityId} OR e.internal_id = ${entityId}
      )
      LIMIT 1
    )
  `;
};

const buildTrialsUsedCTE = (
	withTrialsUsed: boolean,
	orgId: string,
	env: AppEnv
) => {
	if (!withTrialsUsed) {
		return sql``;
	}

	return sql`
    customer_trials_used AS (
      SELECT 
        COALESCE(
          json_agg(json_build_object(
            'product_id', p.id,
            'fingerprint', c.fingerprint,
            'customer_id', c.id
          )) FILTER (WHERE p.id IS NOT NULL),
          '[]'::json
        ) AS trials_used
      FROM customer_products cp
        JOIN products p ON cp.internal_product_id = p.internal_id
        JOIN customers c ON cp.internal_customer_id = c.internal_id
      WHERE (c.id = (SELECT id FROM customer_record) OR (c.fingerprint IS NOT NULL AND c.fingerprint = (SELECT fingerprint FROM customer_record)))
        AND p.org_id = ${orgId}
        AND p.env = ${env}
        AND cp.free_trial_id IS NOT NULL
    )
  `;
};

const buildSubscriptionsCTE = (
	withSubs: boolean,
	inStatuses?: CusProductStatus[]
) => {
	if (!withSubs) {
		return sql``;
	}

	return sql`
    customer_subscriptions AS (
      SELECT 
        COALESCE(
          json_agg(row_to_json(s)) FILTER (WHERE s.stripe_id IS NOT NULL),
          '[]'::json
        ) AS subscriptions
      FROM subscriptions s 
      WHERE EXISTS (
        SELECT 1 FROM customer_products_with_prices cpwp
        WHERE cpwp.subscription_ids @> ARRAY[s.stripe_id]
      )
    )
  `;
};

const buildInvoicesCTE = (hasEntityCTE: boolean) => {
	let entityFilter = hasEntityCTE
		? sql`AND (
      NOT EXISTS (SELECT 1 FROM entity_record) 
      OR i.internal_entity_id = (SELECT internal_id FROM entity_record LIMIT 1)
    )`
		: sql``;

	return sql`
    customer_invoices AS (
      SELECT 
        COALESCE(
          json_agg(row_to_json(i) ORDER BY i.created_at DESC, i.id DESC) FILTER (WHERE i.id IS NOT NULL),
          '[]'::json
        ) AS invoices
      FROM invoices i
      WHERE i.internal_customer_id = (SELECT internal_id FROM customer_record)
      ${entityFilter}
      LIMIT 10
    )
  `;
};

export const getFullCusQuery = (
	idOrInternalId: string,
	orgId: string,
	env: AppEnv,
	inStatuses: CusProductStatus[],
	includeInvoices: boolean,
	withEntities: boolean,
	withTrialsUsed: boolean,
	withSubs: boolean,
	entityId?: string
) => {
	const sqlChunks: SQL[] = [];

	// Step 1: Get customer record
	sqlChunks.push(sql`
    WITH customer_record AS (
      SELECT * FROM customers c
      WHERE (
        c.id = ${idOrInternalId} OR c.internal_id = ${idOrInternalId}
      )
        AND c.org_id = ${orgId}
        AND c.env = ${env}
      ORDER BY (c.id = ${idOrInternalId}) DESC
      LIMIT 1
    )
  `);

	// Step 2: Get entities
	if (withEntities) {
		sqlChunks.push(sql`, `);
		sqlChunks.push(buildEntitiesCTE(withEntities));
	}

	// Step 3: Get entity
	if (entityId) {
		sqlChunks.push(sql`, `);
		sqlChunks.push(buildEntityCTE(entityId));
	}

	// Add customer products CTE
	sqlChunks.push(sql`, `);
	// sqlChunks.push(buildCusProductsCTE(inStatuses));
	sqlChunks.push(buildOptimizedCusProductsCTE(inStatuses));

	// Conditionally add trials used CTE
	if (withTrialsUsed) {
		sqlChunks.push(sql`, `);
		sqlChunks.push(buildTrialsUsedCTE(withTrialsUsed, orgId, env));
	}

	// Conditionally add subscriptions CTE
	if (withSubs) {
		sqlChunks.push(sql`, `);
		sqlChunks.push(buildSubscriptionsCTE(withSubs, inStatuses));
	}

	// Conditionally add invoices CTE
	if (includeInvoices) {
		sqlChunks.push(sql`, `);
		sqlChunks.push(buildInvoicesCTE(!!entityId));
	}

	// Build final SELECT
	const selectFieldsChunks: SQL[] = [];
	selectFieldsChunks.push(sql`
    cr.*,
    COALESCE(
      (SELECT json_agg(cpwp) FROM customer_products_with_prices cpwp),
      '[]'::json
    ) AS customer_products
  `);

	// Add entities to SELECT if withEntities is true
	if (withEntities) {
		selectFieldsChunks.push(sql`,
      (SELECT entities FROM customer_entities) AS entities`);
	}

	// Add entity to SELECT if entityId is provided
	if (entityId) {
		selectFieldsChunks.push(sql`,
      (SELECT row_to_json(er) FROM entity_record er LIMIT 1) AS entity`);
	}

	// Add trials used to SELECT if withTrialsUsed is true
	if (withTrialsUsed) {
		selectFieldsChunks.push(sql`,
      (SELECT trials_used FROM customer_trials_used) AS trials_used`);
	}

	// Add subscriptions to SELECT if withSubs is true
	if (withSubs) {
		selectFieldsChunks.push(sql`,
      (SELECT subscriptions FROM customer_subscriptions) AS subscriptions`);
	}

	if (includeInvoices) {
		selectFieldsChunks.push(sql`,
      (SELECT invoices FROM customer_invoices) AS invoices`);
	}

	sqlChunks.push(sql`
    SELECT ${sql.join(selectFieldsChunks, sql``)}
    FROM customer_record cr
  `);

	return sql.join(sqlChunks, sql``);
};

export const getBulkFullCusQuery = (
	orgId: string,
	env: AppEnv,
	page: number,
	pageSize: number,
	inStatuses: CusProductStatus[],
	withSubs: boolean
) => {
	const sqlChunks: SQL[] = [];

	// Step 1: Get customer record
	sqlChunks.push(sql`
      WITH customer_record AS (
        SELECT * FROM customers c
        WHERE c.org_id = ${orgId}
          AND c.env = ${env}
        ORDER BY c.id
        LIMIT ${pageSize}
        OFFSET ${page * pageSize}
      )
    `);

	// Add customer products CTE
	sqlChunks.push(sql`, `);
	sqlChunks.push(buildOptimizedCusProductsCTE(inStatuses));

	// Conditionally add subscriptions CTE
	if (withSubs) {
		sqlChunks.push(sql`, `);
		sqlChunks.push(buildSubscriptionsCTE(withSubs, inStatuses));
	}

	// Build final SELECT
	const selectFieldsChunks: SQL[] = [];
	selectFieldsChunks.push(sql`
      cr.*,
      COALESCE(
        (SELECT json_agg(cpwp) FROM customer_products_with_prices cpwp),
        '[]'::json
      ) AS customer_products
    `);

	// Add subscriptions to SELECT if withSubs is true
	if (withSubs) {
		selectFieldsChunks.push(sql`,
        (SELECT subscriptions FROM customer_subscriptions) AS subscriptions`);
	}

	sqlChunks.push(sql`
      SELECT ${sql.join(selectFieldsChunks, sql``)}
      FROM customer_record cr
    `);

	return sql.join(sqlChunks, sql``);
};

export const getBulkFullCusQueryClickHouse = (
	orgId: string,
	env: AppEnv,
	page: number,
	pageSize: number,
	inStatuses: CusProductStatus[],
	withSubs: boolean
) => {
	const statusFilter = inStatuses.length > 0 
		? `AND cp.status IN ({statuses:Array(String)})`
		: '';

	const subscriptionsSelect = withSubs ? `, 
		groupArray(
			tuple(s.id, s.org_id, s.stripe_id, s.stripe_schedule_id, s.created_at, s.metadata, s.usage_features, s.env, s.current_period_start, s.current_period_end)
		) AS subscriptions` : '';

	const subscriptionsJoin = withSubs ? `
		LEFT JOIN subscriptions s ON arrayExists(x -> x = s.stripe_id, cp.subscription_ids)` : '';

	return {
		query: `
			SELECT 
				c.id,
				c.internal_id,
				c.org_id,
				c.env,
				c.fingerprint,
				c.created_at,
				c.name,
				c.email,
				c.metadata,
				c.processor,
				groupArray(
					tuple(
						cp.id,
						cp.internal_customer_id,
						cp.internal_product_id,
						cp.internal_entity_id,
						cp.created_at,
						cp.status,
						cp.processor,
						cp.canceled_at,
						cp.ended_at,
						cp.starts_at,
						cp.options,
						cp.product_id,
						cp.free_trial_id,
						cp.trial_ends_at,
						cp.collection_method,
						cp.subscription_ids,
						cp.scheduled_ids,
						cp.quantity,
						cp.is_custom,
						cp.customer_id,
						cp.entity_id,
						cp.api_version,
						tuple(
							prod.internal_id,
							prod.id,
							prod.name,
							prod.org_id,
							prod.created_at,
							prod.env,
							prod.is_add_on,
							prod.is_default,
							prod.group,
							prod.version,
							prod.processor,
							prod.base_variant_id,
							prod.archived
						),
						'[]',
						'[]',
						tuple(
							ft.id,
							ft.created_at,
							ft.internal_product_id,
							ft.duration,
							ft.length,
							ft.unique_fingerprint,
							ft.is_custom,
							ft.card_required
						)
					)
				) AS customer_products
				${subscriptionsSelect}
			FROM customers c
			LEFT JOIN customer_products cp ON c.internal_id = cp.internal_customer_id
			LEFT JOIN products prod ON cp.internal_product_id = prod.internal_id
			LEFT JOIN free_trials ft ON cp.free_trial_id = ft.id
			${subscriptionsJoin}
			WHERE c.org_id = {org_id:String}
				AND c.env = {env:String}
				${statusFilter}
			GROUP BY c.id, c.internal_id, c.org_id, c.env, c.fingerprint, c.created_at, c.name, c.email, c.metadata, c.processor
			ORDER BY c.id
			LIMIT {page_size:UInt32}
			OFFSET {offset:UInt32}
		`,
		query_params: {
			org_id: orgId,
			env: env,
			page_size: pageSize,
			offset: (page - 1) * pageSize,
			...(inStatuses.length > 0 && { statuses: inStatuses })
		}
	};
};
