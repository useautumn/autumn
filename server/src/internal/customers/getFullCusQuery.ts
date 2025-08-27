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

export const getNewBatchCustomersQuery = (
  orgId: string,
  env: AppEnv,
  inStatuses: CusProductStatus[],
  includeInvoices: boolean,
  withEntities: boolean,
  withTrialsUsed: boolean,
  withSubs: boolean,
  page: number = 1,
  pageSize: number = 10,
  entityId?: string
) => {
  const offset = (page - 1) * pageSize;
  
  const withStatusFilter = () => {
    return inStatuses?.length
      ? sql`AND cp.status = ANY(ARRAY[${sql.join(
          inStatuses.map((status) => sql`${status}`),
          sql`, `
        )}])`
      : sql``;
  };

  return sql`
    WITH customer_records AS (
      SELECT c.*
      FROM customers c
      WHERE c.org_id = ${orgId}
        AND c.env = ${env}
      ORDER BY c.created_at DESC
      LIMIT ${pageSize} OFFSET ${offset}
    ),
    
    customer_products_with_prices AS (
      SELECT 
        cp.*,
        row_to_json(prod) AS product,
        
        -- Customer prices with price details
        COALESCE(
          json_agg(DISTINCT (
            to_jsonb(cpr.*) || jsonb_build_object('price', to_jsonb(p.*))
          )) FILTER (WHERE cpr.id IS NOT NULL),
          '[]'::json
        ) AS customer_prices,
        
        -- Customer entitlements with full details including rollovers
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
        
        -- Free trial
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
      WHERE cp.internal_customer_id IN (SELECT internal_id FROM customer_records)
      ${withStatusFilter()}
      GROUP BY cp.id, prod.*
    ),
    
    customer_products_aggregated AS (
      SELECT 
        cpwp.internal_customer_id,
        json_agg(row_to_json(cpwp) ORDER BY cpwp.created_at DESC) AS customer_products
      FROM customer_products_with_prices cpwp
      GROUP BY cpwp.internal_customer_id
    )
    
    ${withSubs ? sql`, customer_subscriptions AS (
      SELECT 
        cpwp.internal_customer_id,
        COALESCE(
          json_agg(row_to_json(s)) FILTER (WHERE s.stripe_id IS NOT NULL),
          '[]'::json
        ) AS subscriptions
      FROM customer_products_with_prices cpwp
      JOIN subscriptions s ON s.stripe_id = ANY(cpwp.subscription_ids)
      GROUP BY cpwp.internal_customer_id
    )` : sql``}
    
    ${withEntities ? sql`, customer_entities AS (
      SELECT 
        e.internal_customer_id,
        COALESCE(
          json_agg(row_to_json(e) ORDER BY e.internal_id DESC),
          '[]'::json
        ) AS entities
      FROM entities e
      WHERE e.internal_customer_id IN (SELECT internal_id FROM customer_records)
      GROUP BY e.internal_customer_id
    )` : sql``}
    
    ${includeInvoices ? sql`, customer_invoices AS (
      SELECT 
        i.internal_customer_id,
        COALESCE(
          json_agg(row_to_json(i) ORDER BY i.created_at DESC, i.id DESC) FILTER (WHERE i.id IS NOT NULL),
          '[]'::json
        ) AS invoices
      FROM invoices i
      WHERE i.internal_customer_id IN (SELECT internal_id FROM customer_records)
      GROUP BY i.internal_customer_id
    )` : sql``}
    
    ${withTrialsUsed ? sql`, customer_trials_used AS (
      SELECT 
        cp.internal_customer_id,
        json_agg(json_build_object(
          'product_id', p.id,
          'fingerprint', c.fingerprint,
          'customer_id', c.id
        )) AS trials_used
      FROM customer_products cp
      JOIN products p ON cp.internal_product_id = p.internal_id
      JOIN customers c ON cp.internal_customer_id = c.internal_id
      WHERE cp.internal_customer_id IN (SELECT internal_id FROM customer_records)
        AND cp.free_trial_id IS NOT NULL
      GROUP BY cp.internal_customer_id
    )` : sql``}
    
    SELECT 
      cr.*,
      COALESCE(cpa.customer_products, '[]'::json) AS customer_products
      ${withSubs ? sql`, COALESCE(cs.subscriptions, '[]'::json) AS subscriptions` : sql``}
      ${withEntities ? sql`, COALESCE(ce.entities, '[]'::json) AS entities` : sql``}
      ${includeInvoices ? sql`, COALESCE(ci.invoices, '[]'::json) AS invoices` : sql``}
      ${withTrialsUsed ? sql`, COALESCE(ctu.trials_used, '[]'::json) AS trials_used` : sql``}
    FROM customer_records cr
    LEFT JOIN customer_products_aggregated cpa ON cpa.internal_customer_id = cr.internal_id
    ${withSubs ? sql`LEFT JOIN customer_subscriptions cs ON cs.internal_customer_id = cr.internal_id` : sql``}
    ${withEntities ? sql`LEFT JOIN customer_entities ce ON ce.internal_customer_id = cr.internal_id` : sql``}
    ${includeInvoices ? sql`LEFT JOIN customer_invoices ci ON ci.internal_customer_id = cr.internal_id` : sql``}
    ${withTrialsUsed ? sql`LEFT JOIN customer_trials_used ctu ON ctu.internal_customer_id = cr.internal_id` : sql``}
    ORDER BY cr.created_at DESC
  `;
};

export const getPaginatedCustomersQuery = (
  orgId: string,
  env: AppEnv,
  inStatuses: CusProductStatus[],
  includeInvoices: boolean,
  withEntities: boolean,
  withTrialsUsed: boolean,
  withSubs: boolean,
  page: number = 1,
  pageSize: number = 10,
  entityId?: string
) => {
  const offset = (page - 1) * pageSize;
  
  const sqlChunks: SQL[] = [];

  // step 1: get paginated customer records (no manual IDs needed)
  sqlChunks.push(sql`
    WITH customer_records AS (
      SELECT * FROM customers c
      WHERE c.org_id = ${orgId}
        AND c.env = ${env}
      ORDER BY c.created_at DESC
      LIMIT ${pageSize} OFFSET ${offset}
    )
  `);

  // step 2: get all entities for these paginated customers
  if (withEntities) {
    sqlChunks.push(sql`, customer_entities AS (
      SELECT 
        e.internal_customer_id,
        json_agg(row_to_json(e) ORDER BY e.internal_id DESC) AS entities
      FROM entities e
      WHERE e.internal_customer_id IN (SELECT internal_id FROM customer_records)
      GROUP BY e.internal_customer_id
    )`);
  }

  // step 3: get specific entity if requested
  if (entityId) {
    sqlChunks.push(sql`, entity_records AS (
      SELECT 
        e.internal_customer_id,
        row_to_json(e) AS entity
      FROM entities e
      WHERE e.internal_customer_id IN (SELECT internal_id FROM customer_records)
        AND (e.id = ${entityId} OR e.internal_id = ${entityId})
    )`);
  }

  // step 4: customer products with all nested data
  const withStatusFilter = () => {
    return inStatuses?.length
      ? sql`AND cp.status = ANY(ARRAY[${sql.join(
          inStatuses.map((status) => sql`${status}`),
          sql`, `
        )}])`
      : sql``;
  };

  sqlChunks.push(sql`, customer_products_aggregated AS (
    SELECT 
      cp.internal_customer_id,
      json_agg(
        json_build_object(
          'id', cp.id,
          'status', cp.status,
          'created_at', cp.created_at::bigint,
          'internal_product_id', cp.internal_product_id,
          'subscription_ids', cp.subscription_ids,
          'free_trial_id', cp.free_trial_id,
          'starts_at', COALESCE(cp.starts_at::bigint, cp.created_at::bigint),
          'options', COALESCE(cp.options, ARRAY[]::jsonb[]),
          'collection_method', COALESCE(cp.collection_method, 'charge_automatically'),
          'product', row_to_json(prod),
          'customer_prices', COALESCE(prices_agg.prices, '[]'::json),
          'customer_entitlements', COALESCE(entitlements_agg.entitlements, '[]'::json),
          'free_trial', ft_data.free_trial
        )
      ) AS customer_products
    FROM customer_products cp
    JOIN products prod ON cp.internal_product_id = prod.internal_id
    LEFT JOIN (
      SELECT 
        cpr.customer_product_id,
        json_agg(
          to_jsonb(cpr.*) || jsonb_build_object('price', to_jsonb(p.*))
        ) AS prices
      FROM customer_prices cpr
      JOIN prices p ON cpr.price_id = p.id
      WHERE cpr.customer_product_id IN (
        SELECT id FROM customer_products 
        WHERE internal_customer_id IN (SELECT internal_id FROM customer_records)
      )
      GROUP BY cpr.customer_product_id
    ) prices_agg ON prices_agg.customer_product_id = cp.id
    LEFT JOIN (
      SELECT 
        ce.customer_product_id,
        json_agg(
          to_jsonb(ce.*) || jsonb_build_object(
            'entitlement', ent_data.entitlement,
            'replaceables', COALESCE(repl_data.replaceables, '[]'::json),
            'rollovers', COALESCE(roll_data.rollovers, '[]'::json)
          )
        ) AS entitlements
      FROM customer_entitlements ce
      LEFT JOIN (
        SELECT 
          ce2.id as ce_id,
          json_build_object(
            'id', e.id,
            'internal_feature_id', e.internal_feature_id,
            'feature', row_to_json(f)
          ) AS entitlement
        FROM customer_entitlements ce2
        JOIN entitlements e ON ce2.entitlement_id = e.id
        JOIN features f ON e.internal_feature_id = f.internal_id
        WHERE ce2.customer_product_id IN (
          SELECT id FROM customer_products 
          WHERE internal_customer_id IN (SELECT internal_id FROM customer_records)
        )
      ) ent_data ON ent_data.ce_id = ce.id
      LEFT JOIN (
        SELECT 
          r.cus_ent_id,
          json_agg(row_to_json(r)) AS replaceables
        FROM replaceables r
        WHERE r.cus_ent_id IN (
          SELECT id FROM customer_entitlements 
          WHERE customer_product_id IN (
            SELECT id FROM customer_products 
            WHERE internal_customer_id IN (SELECT internal_id FROM customer_records)
          )
        )
        GROUP BY r.cus_ent_id
      ) repl_data ON repl_data.cus_ent_id = ce.id
      LEFT JOIN (
        SELECT 
          ro.cus_ent_id,
          json_agg(row_to_json(ro) ORDER BY ro.expires_at ASC) AS rollovers
        FROM rollovers ro
        WHERE ro.cus_ent_id IN (
          SELECT id FROM customer_entitlements 
          WHERE customer_product_id IN (
            SELECT id FROM customer_products 
            WHERE internal_customer_id IN (SELECT internal_id FROM customer_records)
          )
        )
        AND ro.expires_at > EXTRACT(EPOCH FROM now()) * 1000
        GROUP BY ro.cus_ent_id
      ) roll_data ON roll_data.cus_ent_id = ce.id
      WHERE ce.customer_product_id IN (
        SELECT id FROM customer_products 
        WHERE internal_customer_id IN (SELECT internal_id FROM customer_records)
      )
      GROUP BY ce.customer_product_id
    ) entitlements_agg ON entitlements_agg.customer_product_id = cp.id
    LEFT JOIN (
      SELECT 
        cp2.id as cp_id,
        row_to_json(ft) AS free_trial
      FROM customer_products cp2
      JOIN free_trials ft ON cp2.free_trial_id = ft.id
      WHERE cp2.internal_customer_id IN (SELECT internal_id FROM customer_records)
    ) ft_data ON ft_data.cp_id = cp.id
    WHERE cp.internal_customer_id IN (SELECT internal_id FROM customer_records)
    ${withStatusFilter()}
    GROUP BY cp.internal_customer_id
  )`);

  // step 5: trials used
  if (withTrialsUsed) {
    sqlChunks.push(sql`, customer_trials_used AS (
      SELECT 
        cp.internal_customer_id,
        json_agg(json_build_object(
          'product_id', p.id,
          'fingerprint', c.fingerprint,
          'customer_id', c.id
        )) AS trials_used
      FROM customer_products cp
      JOIN products p ON cp.internal_product_id = p.internal_id
      JOIN customers c ON cp.internal_customer_id = c.internal_id
      WHERE cp.internal_customer_id IN (SELECT internal_id FROM customer_records)
        AND p.org_id = ${orgId}
        AND p.env = ${env}
        AND cp.free_trial_id IS NOT NULL
      GROUP BY cp.internal_customer_id
    )`);
  }

  // step 6: subscriptions
  if (withSubs) {
    sqlChunks.push(sql`, customer_subscriptions AS (
      SELECT 
        cp.internal_customer_id,
        json_agg(row_to_json(s)) AS subscriptions
      FROM customer_products cp
      JOIN subscriptions s ON s.stripe_id = ANY(cp.subscription_ids)
      WHERE cp.internal_customer_id IN (SELECT internal_id FROM customer_records)
      GROUP BY cp.internal_customer_id
    )`);
  }

  // step 7: invoices
  if (includeInvoices) {
    const entityFilter = entityId
      ? sql`AND (
          NOT EXISTS (SELECT 1 FROM entity_records er WHERE er.internal_customer_id = i.internal_customer_id) 
          OR i.internal_entity_id IN (SELECT e.internal_id FROM entities e WHERE e.id = ${entityId} OR e.internal_id = ${entityId})
        )`
      : sql``;

    sqlChunks.push(sql`, customer_invoices AS (
      SELECT 
        i.internal_customer_id,
        json_agg(row_to_json(i) ORDER BY i.created_at DESC, i.id DESC) AS invoices
      FROM (
        SELECT i2.*
        FROM invoices i2
        WHERE i2.internal_customer_id IN (SELECT internal_id FROM customer_records)
        ${entityFilter}
        ORDER BY i2.created_at DESC, i2.id DESC
      ) i
      GROUP BY i.internal_customer_id
    )`);
  }

  // final select with all the joins
  const selectFields: SQL[] = [];
  selectFields.push(sql`
    cr.*,
    COALESCE(cpa.customer_products, '[]'::json) AS customer_products
  `);

  if (withEntities) {
    selectFields.push(sql`,
      COALESCE(ce.entities, '[]'::json) AS entities`);
  }

  if (entityId) {
    selectFields.push(sql`,
      er.entity AS entity`);
  }

  if (withTrialsUsed) {
    selectFields.push(sql`,
      COALESCE(ctu.trials_used, '[]'::json) AS trials_used`);
  }

  if (withSubs) {
    selectFields.push(sql`,
      COALESCE(cs.subscriptions, '[]'::json) AS subscriptions`);
  }

  if (includeInvoices) {
    selectFields.push(sql`,
      COALESCE(ci.invoices, '[]'::json) AS invoices`);
  }

  sqlChunks.push(sql`
    SELECT ${sql.join(selectFields, sql``)}
    FROM customer_records cr
    LEFT JOIN customer_products_aggregated cpa ON cpa.internal_customer_id = cr.internal_id
    ${withEntities ? sql`LEFT JOIN customer_entities ce ON ce.internal_customer_id = cr.internal_id` : sql``}
    ${entityId ? sql`LEFT JOIN entity_records er ON er.internal_customer_id = cr.internal_id` : sql``}
    ${withTrialsUsed ? sql`LEFT JOIN customer_trials_used ctu ON ctu.internal_customer_id = cr.internal_id` : sql``}
    ${withSubs ? sql`LEFT JOIN customer_subscriptions cs ON cs.internal_customer_id = cr.internal_id` : sql``}
    ${includeInvoices ? sql`LEFT JOIN customer_invoices ci ON ci.internal_customer_id = cr.internal_id` : sql``}
    ORDER BY cr.created_at DESC
  `);

  return sql.join(sqlChunks, sql``);
};

export const getPaginatedCustomersQueryClickHouse = (
  orgId: string,
  env: string,
  inStatuses: string[],
  includeInvoices: boolean,
  withEntities: boolean,
  withTrialsUsed: boolean,
  withSubs: boolean,
  page: number = 1,
  pageSize: number = 10,
  entityId?: string
) => {
  const offset = (page - 1) * pageSize;
  
  // build the status filter
  const statusFilter = inStatuses?.length 
    ? `AND cp.status IN (${inStatuses.map(s => `'${s}'`).join(', ')})`
    : '';

  return `
    WITH customer_records AS (
      SELECT * FROM customers c
      WHERE c.org_id = {orgId:String}
        AND c.env = {env:String}
      ORDER BY c.created_at DESC
      LIMIT {pageSize:UInt32} OFFSET {offset:UInt32}
    ),
    
    customer_products_aggregated AS (
      SELECT 
        cp.internal_customer_id,
        groupArray(tuple(
          cp.id,
          cp.status,
          cp.created_at,
          cp.internal_product_id,
          cp.subscription_ids,
          cp.free_trial_id,
          tuple(
            prod.internal_id,
            prod.id,
            prod.name,
            prod.org_id,
            prod.env,
            prod.created_at
          ),
          if(cpr.id IS NOT NULL, 
            groupArray(tuple(
              cpr.id,
              cpr.customer_product_id,
              cpr.price_id,
              cpr.created_at,
              tuple(
                p.id,
                p.org_id,
                p.internal_product_id,
                p.config,
                p.created_at,
                p.billing_type,
                p.is_custom,
                p.entitlement_id,
                p.proration_config
              )
            )),
            []
          ),
          if(ce.id IS NOT NULL,
            groupArray(tuple(
              ce.id,
              ce.customer_product_id,
              ce.entitlement_id,
              ce.created_at,
              tuple(
                e.id,
                e.internal_feature_id,
                e.created_at,
                tuple(
                  f.internal_id,
                  f.id,
                  f.name,
                  f.org_id,
                  f.env,
                  f.created_at
                )
              ),
              [],
              []
            )),
            []
          ),
          if(ft.id IS NOT NULL, 
            tuple(ft.id, ft.created_at), 
            tuple(NULL, NULL)
          )
        )) AS customer_products
      FROM customer_products cp
      JOIN products prod ON cp.internal_product_id = prod.internal_id
      LEFT JOIN customer_prices cpr ON cpr.customer_product_id = cp.id
      LEFT JOIN prices p ON cpr.price_id = p.id
      LEFT JOIN customer_entitlements ce ON ce.customer_product_id = cp.id
      LEFT JOIN entitlements e ON ce.entitlement_id = e.id
      LEFT JOIN features f ON e.internal_feature_id = f.internal_id
      LEFT JOIN free_trials ft ON cp.free_trial_id = ft.id
      WHERE cp.internal_customer_id IN (SELECT internal_id FROM customer_records)
      ${statusFilter}
      GROUP BY cp.internal_customer_id
    )
    
    ${withEntities ? `,
    customer_entities AS (
      SELECT 
        e.internal_customer_id,
        groupArray(tuple(
          e.internal_id,
          e.id,
          e.created_at
        )) AS entities
      FROM entities e
      WHERE e.internal_customer_id IN (SELECT internal_id FROM customer_records)
      GROUP BY e.internal_customer_id
    )` : ''}
    
    ${entityId ? `,
    entity_records AS (
      SELECT 
        e.internal_customer_id,
        tuple(
          e.internal_id,
          e.id,
          e.created_at
        ) AS entity
      FROM entities e
      WHERE e.internal_customer_id IN (SELECT internal_id FROM customer_records)
        AND (e.id = {entityId:String} OR e.internal_id = {entityId:String})
    )` : ''}
    
    ${withTrialsUsed ? `,
    customer_trials_used AS (
      SELECT 
        cp.internal_customer_id,
        groupArray(tuple(
          p.id,
          c.fingerprint,
          c.id
        )) AS trials_used
      FROM customer_products cp
      JOIN products p ON cp.internal_product_id = p.internal_id
      JOIN customers c ON cp.internal_customer_id = c.internal_id
      WHERE cp.internal_customer_id IN (SELECT internal_id FROM customer_records)
        AND p.org_id = {orgId:String}
        AND p.env = {env:String}
        AND cp.free_trial_id IS NOT NULL
      GROUP BY cp.internal_customer_id
    )` : ''}
    
    ${withSubs ? `,
    customer_subscriptions AS (
      SELECT 
        cp.internal_customer_id,
        groupArray(tuple(
          s.stripe_id,
          s.created_at
        )) AS subscriptions
      FROM customer_products cp
      ARRAY JOIN cp.subscription_ids AS sub_id
      JOIN subscriptions s ON s.stripe_id = sub_id
      WHERE cp.internal_customer_id IN (SELECT internal_id FROM customer_records)
      GROUP BY cp.internal_customer_id
    )` : ''}
    
    ${includeInvoices ? `,
    customer_invoices AS (
      SELECT 
        i.internal_customer_id,
        groupArray(tuple(
          i.id,
          i.created_at,
          i.internal_entity_id
        )) AS invoices
      FROM invoices i
      WHERE i.internal_customer_id IN (SELECT internal_id FROM customer_records)
      ${entityId ? `AND (
        NOT EXISTS (SELECT 1 FROM entity_records er WHERE er.internal_customer_id = i.internal_customer_id) 
        OR i.internal_entity_id IN (SELECT e.internal_id FROM entities e WHERE e.id = {entityId:String} OR e.internal_id = {entityId:String})
      )` : ''}
      GROUP BY i.internal_customer_id
      ORDER BY i.created_at DESC, i.id DESC
      LIMIT 10
    )` : ''}
    
    SELECT 
      cr.*,
      COALESCE(cpa.customer_products, []) AS customer_products
      ${withEntities ? ', COALESCE(ce.entities, []) AS entities' : ''}
      ${entityId ? ', er.entity AS entity' : ''}
      ${withTrialsUsed ? ', COALESCE(ctu.trials_used, []) AS trials_used' : ''}
      ${withSubs ? ', COALESCE(cs.subscriptions, []) AS subscriptions' : ''}
      ${includeInvoices ? ', COALESCE(ci.invoices, []) AS invoices' : ''}
    FROM customer_records cr
    LEFT JOIN customer_products_aggregated cpa ON cr.internal_id = cpa.internal_customer_id
    ${withEntities ? 'LEFT JOIN customer_entities ce ON ce.internal_customer_id = cr.internal_id' : ''}
    ${entityId ? 'LEFT JOIN entity_records er ON er.internal_customer_id = cr.internal_id' : ''}
    ${withTrialsUsed ? 'LEFT JOIN customer_trials_used ctu ON ctu.internal_customer_id = cr.internal_id' : ''}
    ${withSubs ? 'LEFT JOIN customer_subscriptions cs ON cs.internal_customer_id = cr.internal_id' : ''}
    ${includeInvoices ? 'LEFT JOIN customer_invoices ci ON ci.internal_customer_id = cr.internal_id' : ''}
    ORDER BY cr.created_at DESC
  `;
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

	return {
		query: `
			WITH customer_records AS (
				SELECT c.id, c.internal_id, c.org_id, c.env, c.fingerprint, 
					   c.created_at, c.name, c.email, c.metadata, c.processor
				FROM customers c
				WHERE c.org_id = {org_id:String} AND c.env = {env:String}
				ORDER BY c.id
				LIMIT {offset:UInt32}, {page_size:UInt32}
			),
			customer_products_with_prices AS (
				SELECT 
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
					
					-- Product data
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
					) AS product,
					
					-- Aggregated customer_prices (simplified to avoid tuple size mismatch)
					groupArray(
						tuple(
							cpr.id,
							cpr.created_at,
							cpr.price_id,
							cpr.options,
							cpr.internal_customer_id,
							cpr.customer_product_id,
							p.id,
							p.org_id,
							p.internal_product_id,
							p.config,
							p.created_at,
							p.billing_type,
							p.is_custom,
							p.entitlement_id,
							p.proration_config
						)
					) AS customer_prices,
					
					-- Aggregated customer_entitlements (simplified)
					groupArray(
						tuple(
							ce.id,
							ce.customer_product_id,
							ce.entitlement_id,
							ce.internal_customer_id,
							ce.internal_feature_id,
							ce.unlimited,
							ce.balance,
							ce.created_at,
							ce.next_reset_at,
							ce.usage_allowed,
							ce.adjustment,
							ce.entities,
							ce.customer_id,
							ce.feature_id,
							e.id,
							e.created_at,
							e.internal_feature_id,
							e.internal_product_id,
							e.is_custom,
							e.allowance_type,
							e.allowance,
							e.interval,
							e.interval_count,
							e.carry_from_previous,
							e.entity_feature_id,
							e.org_id,
							e.feature_id,
							e.usage_limit,
							e.rollover,
							f.internal_id,
							f.org_id,
							f.created_at,
							f.env,
							f.id,
							f.name,
							f.type,
							f.config,
							f.display,
							f.archived
						)
					) AS customer_entitlements,
					
					-- Free trial
					tuple(
						ft.id,
						ft.created_at,
						ft.internal_product_id,
						ft.duration,
						ft.length,
						ft.unique_fingerprint,
						ft.is_custom,
						ft.card_required
					) AS free_trial
					
				FROM customer_products cp
				JOIN products prod ON cp.internal_product_id = prod.internal_id
				LEFT JOIN customer_prices cpr ON cpr.customer_product_id = cp.id
				LEFT JOIN prices p ON cpr.price_id = p.id
				LEFT JOIN customer_entitlements ce ON ce.customer_product_id = cp.id
				LEFT JOIN entitlements e ON ce.entitlement_id = e.id
				LEFT JOIN features f ON e.internal_feature_id = f.internal_id
				LEFT JOIN replaceables r ON ce.id = r.cus_ent_id
				LEFT JOIN rollovers ro ON ce.id = ro.cus_ent_id
				LEFT JOIN free_trials ft ON cp.free_trial_id = ft.id
				WHERE cp.internal_customer_id IN (SELECT internal_id FROM customer_records)
				${statusFilter}
				GROUP BY cp.id, cp.internal_customer_id, cp.internal_product_id, cp.internal_entity_id, 
						 cp.created_at, cp.status, cp.processor, cp.canceled_at, cp.ended_at, cp.starts_at,
						 cp.options, cp.product_id, cp.free_trial_id, cp.trial_ends_at, cp.collection_method,
						 cp.subscription_ids, cp.scheduled_ids, cp.quantity, cp.is_custom, cp.customer_id, 
						 cp.entity_id, cp.api_version,
						 prod.internal_id, prod.id, prod.name, prod.org_id, prod.created_at, prod.env,
						 prod.is_add_on, prod.is_default, prod.group, prod.version, prod.processor,
						 prod.base_variant_id, prod.archived,
						 ft.id, ft.created_at, ft.internal_product_id, ft.duration, ft.length,
						 ft.unique_fingerprint, ft.is_custom, ft.card_required
			),
			customer_aggregated AS (
				SELECT 
					cr.*,
					groupArray(cpwp) AS customer_products
				FROM customer_records cr
				LEFT JOIN customer_products_with_prices cpwp ON cr.internal_id = cpwp.internal_customer_id
				GROUP BY cr.id, cr.internal_id, cr.org_id, cr.env, cr.fingerprint, cr.created_at, cr.name, cr.email, cr.metadata, cr.processor
			)
			SELECT * FROM customer_aggregated
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
