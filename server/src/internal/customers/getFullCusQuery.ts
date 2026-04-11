import {
	type AppEnv,
	type CusProductStatus,
	type ListCustomersV2Params,
	RELEVANT_STATUSES,
} from "@autumn/shared";
import { type SQL, sql } from "drizzle-orm";

const buildOptimizedCusProductsCTE = ({
	inStatuses,
	cusProductLimit,
}: {
	inStatuses?: CusProductStatus[];
	cusProductLimit: number;
}) => {
	const withStatusFilter = () => {
		return inStatuses
			? sql`AND cp.status = ANY(ARRAY[${sql.join(
					inStatuses.map((status) => sql`${status}`),
					sql`, `,
				)}])`
			: sql``;
	};

	const relevantStatusFirst = sql`CASE WHEN cp.status = ANY(ARRAY[${sql.join(
		RELEVANT_STATUSES.map((status) => sql`${status}`),
		sql`, `,
	)}]) THEN 0 ELSE 1 END`;

	return sql`
    customer_products_with_prices AS (
      SELECT 
        cp.*,
        row_to_json(prod) AS product,
        cpr_data.customer_prices,
        ce_data.customer_entitlements,
        ft_data.free_trial

      FROM customer_products cp
      JOIN products prod ON cp.internal_product_id = prod.internal_id
      LEFT JOIN LATERAL (
        SELECT COALESCE(
          json_agg(
            to_jsonb(cpr.*) || jsonb_build_object('price', to_jsonb(p.*))
          ) FILTER (WHERE cpr.id IS NOT NULL),
          '[]'::json
        ) AS customer_prices
        FROM customer_prices cpr
        LEFT JOIN prices p ON cpr.price_id = p.id
        WHERE cpr.customer_product_id = cp.id
      ) cpr_data ON true
      LEFT JOIN LATERAL (
        SELECT COALESCE(
          json_agg(
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
                  json_agg(row_to_json(ro) ORDER BY ro.expires_at ASC NULLS LAST) FILTER (WHERE ro.expires_at > EXTRACT(EPOCH FROM now()) * 1000 OR ro.expires_at IS NULL),
                  '[]'::json
                )
                FROM rollovers ro
                WHERE ro.cus_ent_id = ce.id
              )
            )
          ) FILTER (WHERE ce.id IS NOT NULL),
          '[]'::json
        ) AS customer_entitlements
        FROM customer_entitlements ce
        WHERE ce.customer_product_id = cp.id
      ) ce_data ON true
      LEFT JOIN LATERAL (
        SELECT row_to_json(ft) AS free_trial
        FROM free_trials ft
        WHERE ft.id = cp.free_trial_id
      ) ft_data ON true
      WHERE cp.internal_customer_id = (SELECT internal_id FROM customer_record)
      ${withStatusFilter()}
      ORDER BY ${relevantStatusFirst}, prod.is_add_on ASC, cp.created_at DESC
      LIMIT ${cusProductLimit}
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
          json_agg(row_to_json(e) ORDER BY e.internal_id DESC) FILTER (WHERE e.internal_id IS NOT NULL),
          '[]'::json
        ) AS entities
      FROM (
        SELECT * FROM entities e
        WHERE e.internal_customer_id = (SELECT internal_id FROM customer_record)
        ORDER BY e.internal_id DESC
        LIMIT 1000
      ) e
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
	env: AppEnv,
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
	_inStatuses?: CusProductStatus[],
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
      FROM (
        SELECT DISTINCT s.*
        FROM customer_products_with_prices cpwp
        JOIN LATERAL unnest(cpwp.subscription_ids) AS cpwp_sub(stripe_id) ON true
        JOIN subscriptions s ON s.stripe_id = cpwp_sub.stripe_id
      ) s
    )
  `;
};

const buildExtraEntitlementsCTE = () => {
	return sql`
    extra_customer_entitlements AS (
      SELECT
        COALESCE(
          json_agg(
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
                  json_agg(row_to_json(ro) ORDER BY ro.expires_at ASC NULLS LAST)
                  FILTER (WHERE ro.expires_at > EXTRACT(EPOCH FROM now()) * 1000 OR ro.expires_at IS NULL),
                  '[]'::json
                )
                FROM rollovers ro
                WHERE ro.cus_ent_id = ce.id
              )
            )
            ORDER BY ce.id DESC
          ) FILTER (WHERE ce.id IS NOT NULL),
          '[]'::json
        ) AS extra_customer_entitlements
      FROM (
        SELECT *
        FROM customer_entitlements ce
        WHERE ce.internal_customer_id = (SELECT internal_id FROM customer_record)
          AND ce.customer_product_id IS NULL
          AND (ce.expires_at IS NULL OR ce.expires_at > EXTRACT(EPOCH FROM now()) * 1000)
        ORDER BY ce.id DESC
        LIMIT 30
      ) ce
    )
  `;
};

const buildInvoicesCTE = (hasEntityCTE: boolean) => {
	const entityFilter = hasEntityCTE
		? sql`AND (
      NOT EXISTS (SELECT 1 FROM entity_record) 
      OR i.internal_entity_id = (SELECT internal_id FROM entity_record LIMIT 1)
      OR i.internal_entity_id IS NULL
    )`
		: sql``;

	return sql`
    customer_invoices AS (
      SELECT 
        COALESCE(
          json_agg(row_to_json(i) ORDER BY i.created_at DESC, i.id DESC) FILTER (WHERE i.id IS NOT NULL),
          '[]'::json
        ) AS invoices
      FROM (
        SELECT *
        FROM invoices i
        WHERE i.internal_customer_id = (SELECT internal_id FROM customer_record)
        ${entityFilter}
        ORDER BY i.created_at DESC, i.id DESC
        LIMIT 10
      ) i
    )
  `;
};

export const getFullCusQuery = ({
	idOrInternalId,
	orgId,
	env,
	inStatuses,
	includeInvoices,
	withEntities,
	withTrialsUsed,
	withSubs,
	withEvents,
	entityId,
	cusProductLimit,
}: {
	idOrInternalId: string;
	orgId: string;
	env: AppEnv;
	inStatuses: CusProductStatus[];
	includeInvoices: boolean;
	withEntities: boolean;
	withTrialsUsed: boolean;
	withSubs: boolean;
	withEvents: boolean;
	entityId?: string;
	cusProductLimit: number;
}) => {
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
	sqlChunks.push(buildOptimizedCusProductsCTE({ inStatuses, cusProductLimit }));

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

	// Unconditionally add extra entitlements CTE
	sqlChunks.push(sql`, `);
	sqlChunks.push(buildExtraEntitlementsCTE());

	// Conditionally add invoices CTE
	if (includeInvoices) {
		sqlChunks.push(sql`, `);
		sqlChunks.push(buildInvoicesCTE(!!entityId));
	}

	// Conditionally add events CTE
	if (withEvents) {
		sqlChunks.push(sql`, `);
		sqlChunks.push(sql`
      customer_events AS (
        SELECT 
          COALESCE(
            json_agg(
              json_build_object(
                'id', e.id,
                'event_name', e.event_name,
                'value', e.value,
                'timestamp', e.timestamp,
                'properties', e.properties
              )
              ORDER BY e.timestamp DESC, e.id DESC
            ) FILTER (WHERE e.id IS NOT NULL),
            '[]'::json
          ) AS events
        FROM events e
        WHERE e.internal_customer_id = (SELECT internal_id FROM customer_record)
          AND e.set_usage = false
      )
    `);
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

	selectFieldsChunks.push(sql`,
    (SELECT extra_customer_entitlements FROM extra_customer_entitlements) AS extra_customer_entitlements`);

	if (includeInvoices) {
		selectFieldsChunks.push(sql`,
      (SELECT invoices FROM customer_invoices) AS invoices`);
	}

	if (withEvents) {
		selectFieldsChunks.push(sql`,
      (SELECT events FROM customer_events) AS events`);
	}

	sqlChunks.push(sql`
    SELECT ${sql.join(selectFieldsChunks, sql``)}
    FROM customer_record cr
  `);

	return sql.join(sqlChunks, sql``);
};

export const getPaginatedFullCusQuery = ({
	orgId,
	env,
	inStatuses,
	includeInvoices,
	withEntities,
	withTrialsUsed,
	withSubs,
	limit = 10,
	offset = 0,
	withEvents = false,
	entityId: _entityId,
	internalCustomerIds,
	plans,
	search,
	cusProductLimit,
}: {
	orgId: string;
	env: AppEnv;
	inStatuses?: CusProductStatus[];
	includeInvoices: boolean;
	withEntities: boolean;
	withTrialsUsed: boolean;
	withSubs: boolean;
	limit: number;
	offset: number;
	withEvents?: boolean;
	entityId?: string;
	internalCustomerIds?: string[];
	plans?: ListCustomersV2Params["plans"];
	search?: string;
	cusProductLimit: number;
}) => {
	const withStatusFilter = () => {
		return inStatuses?.length
			? sql`AND cp.status = ANY(ARRAY[${sql.join(
					inStatuses.map((status) => sql`${status}`),
					sql`, `,
				)}])`
			: sql``;
	};

	const customerListFilterSql = getCustomerListFilterSql({
		internalCustomerIds,
		inStatuses,
		plans,
		search,
	});

	// ADDITION: Unconditionally add extra entitlements CTE (305-308)
	// This matches the style of the rest of the CTE construction blocks.
	// Extra entitlements are those without a customer_product_id (loose entitlements)
	const extraEntitlementsCTE = sql`, extra_customer_entitlements AS (
    SELECT
      cr.internal_id AS internal_customer_id,
      COALESCE(
        json_agg(
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
                json_agg(row_to_json(ro) ORDER BY ro.expires_at ASC NULLS LAST)
                FILTER (WHERE ro.expires_at > EXTRACT(EPOCH FROM now()) * 1000 OR ro.expires_at IS NULL),
                '[]'::json
              )
              FROM rollovers ro
              WHERE ro.cus_ent_id = ce.id
            )
          )
          ORDER BY ce.id DESC
        ) FILTER (WHERE ce.id IS NOT NULL),
        '[]'::json
      ) AS extra_customer_entitlements
    FROM customer_records cr
    LEFT JOIN LATERAL (
      SELECT *
      FROM customer_entitlements ce
      WHERE ce.internal_customer_id = cr.internal_id
        AND ce.customer_product_id IS NULL
        AND (ce.expires_at IS NULL OR ce.expires_at > EXTRACT(EPOCH FROM now()) * 1000)
      ORDER BY ce.id DESC
      LIMIT 30
    ) ce ON true
    GROUP BY cr.internal_id
  )`;

	return sql`
    WITH customer_records AS (
      SELECT c.*
      FROM customers c
      WHERE c.org_id = ${orgId}
        AND c.env = ${env}
	      ${customerListFilterSql}
      ORDER BY c.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    ),
    
    customer_products_with_prices AS (
      SELECT 
        cp.*,
        row_to_json(prod) AS product,
        cpr_data.customer_prices,
        ce_data.customer_entitlements,
        ft_data.free_trial

      FROM customer_records cr
      JOIN LATERAL (
        SELECT *
        FROM customer_products cp
        WHERE cp.internal_customer_id = cr.internal_id
        ${withStatusFilter()}
        ORDER BY (SELECT p.is_add_on FROM products p WHERE p.internal_id = cp.internal_product_id) ASC, cp.created_at DESC
        LIMIT ${cusProductLimit}
      ) cp ON true
      JOIN products prod ON cp.internal_product_id = prod.internal_id
      LEFT JOIN LATERAL (
        SELECT COALESCE(
          json_agg(
            to_jsonb(cpr.*) || jsonb_build_object('price', to_jsonb(p.*))
          ) FILTER (WHERE cpr.id IS NOT NULL),
          '[]'::json
        ) AS customer_prices
        FROM customer_prices cpr
        LEFT JOIN prices p ON cpr.price_id = p.id
        WHERE cpr.customer_product_id = cp.id
      ) cpr_data ON true
      LEFT JOIN LATERAL (
        SELECT COALESCE(
          json_agg(
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
                  json_agg(row_to_json(ro) ORDER BY ro.expires_at ASC NULLS LAST) FILTER (WHERE ro.expires_at > EXTRACT(EPOCH FROM now()) * 1000 OR ro.expires_at IS NULL),
                  '[]'::json
                )
                FROM rollovers ro
                WHERE ro.cus_ent_id = ce.id
              )
            )
          ) FILTER (WHERE ce.id IS NOT NULL),
          '[]'::json
        ) AS customer_entitlements
        FROM customer_entitlements ce
        WHERE ce.customer_product_id = cp.id
      ) ce_data ON true
      LEFT JOIN LATERAL (
        SELECT row_to_json(ft) AS free_trial
        FROM free_trials ft
        WHERE ft.id = cp.free_trial_id
      ) ft_data ON true
    ),
    
    customer_products_aggregated AS (
      SELECT 
        cpwp.internal_customer_id,
        json_agg(row_to_json(cpwp) ORDER BY cpwp.created_at DESC) AS customer_products
      FROM customer_products_with_prices cpwp
      GROUP BY cpwp.internal_customer_id
    )
    
    ${
			withSubs
				? sql`, customer_subscriptions AS (
      SELECT 
        s.internal_customer_id,
        COALESCE(
          json_agg(row_to_json(s)) FILTER (WHERE s.stripe_id IS NOT NULL),
          '[]'::json
        ) AS subscriptions
      FROM (
        SELECT DISTINCT
          cpwp.internal_customer_id,
          s.*
        FROM customer_products_with_prices cpwp
        JOIN LATERAL unnest(cpwp.subscription_ids) AS cpwp_sub(stripe_id) ON true
        JOIN subscriptions s ON s.stripe_id = cpwp_sub.stripe_id
      ) s
      GROUP BY s.internal_customer_id
    )`
				: sql``
		}

    ${
			withEvents
				? sql`, customer_events AS (
      SELECT 
        e.internal_customer_id,
        COALESCE(
          json_agg(
            json_build_object(
              'id', e.id,
              'event_name', e.event_name,
              'value', e.value,
              'timestamp', e.timestamp,
              'properties', e.properties
            )
            ORDER BY e.timestamp DESC, e.id DESC
          ) FILTER (WHERE e.id IS NOT NULL),
          '[]'::json
        ) AS events
      FROM events e
      WHERE e.internal_customer_id IN (SELECT internal_id FROM customer_records)
        AND e.set_usage = false
      GROUP BY e.internal_customer_id
    )`
				: sql``
		}
     
    ${
			withEntities
				? sql`, customer_entities AS (
      SELECT 
        cr.internal_id AS internal_customer_id,
        COALESCE(
          json_agg(row_to_json(e) ORDER BY e.internal_id DESC) FILTER (WHERE e.internal_id IS NOT NULL),
          '[]'::json
        ) AS entities
      FROM customer_records cr
      LEFT JOIN LATERAL (
        SELECT *
        FROM entities e
        WHERE e.internal_customer_id = cr.internal_id
        ORDER BY e.internal_id DESC
        LIMIT 1000
      ) e ON true
      GROUP BY cr.internal_id
    )`
				: sql``
		}
    
    ${
			includeInvoices
				? sql`, customer_invoices AS (
      SELECT 
        cr.internal_id AS internal_customer_id,
        COALESCE(
          json_agg(row_to_json(i) ORDER BY i.created_at DESC, i.id DESC) FILTER (WHERE i.id IS NOT NULL),
          '[]'::json
        ) AS invoices
      FROM customer_records cr
      LEFT JOIN LATERAL (
        SELECT *
        FROM invoices i
        WHERE i.internal_customer_id = cr.internal_id
        ORDER BY i.created_at DESC, i.id DESC
        LIMIT 10
      ) i ON true
      GROUP BY cr.internal_id
    )`
				: sql``
		}
    
    ${
			withTrialsUsed
				? sql`, customer_trials_used AS (
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
    )`
				: sql``
		}

    ${extraEntitlementsCTE}
    
    SELECT 
      cr.*,
      COALESCE(cpa.customer_products, '[]'::json) AS customer_products
      ${withSubs ? sql`, COALESCE(cs.subscriptions, '[]'::json) AS subscriptions` : sql``}
      ${withEntities ? sql`, COALESCE(ce.entities, '[]'::json) AS entities` : sql``}
      ${includeInvoices ? sql`, COALESCE(ci.invoices, '[]'::json) AS invoices` : sql``}
      ${withTrialsUsed ? sql`, COALESCE(ctu.trials_used, '[]'::json) AS trials_used` : sql``}
      ${withEvents ? sql`, COALESCE(cev.events, '[]'::json) AS events` : sql``}
      , COALESCE(ece.extra_customer_entitlements, '[]'::json) AS extra_customer_entitlements
    FROM customer_records cr
    LEFT JOIN customer_products_aggregated cpa ON cpa.internal_customer_id = cr.internal_id
    ${withSubs ? sql`LEFT JOIN customer_subscriptions cs ON cs.internal_customer_id = cr.internal_id` : sql``}
    ${withEntities ? sql`LEFT JOIN customer_entities ce ON ce.internal_customer_id = cr.internal_id` : sql``}
    ${includeInvoices ? sql`LEFT JOIN customer_invoices ci ON ci.internal_customer_id = cr.internal_id` : sql``}
    ${withTrialsUsed ? sql`LEFT JOIN customer_trials_used ctu ON ctu.internal_customer_id = cr.internal_id` : sql``}
    ${withEvents ? sql`LEFT JOIN customer_events cev ON cev.internal_customer_id = cr.internal_id` : sql``}
    LEFT JOIN extra_customer_entitlements ece ON ece.internal_customer_id = cr.internal_id
    ORDER BY cr.created_at DESC
  `;
};

export const hasCustomerListFilters = ({
	internalCustomerIds,
	inStatuses: _inStatuses,
	plans,
	processors,
	search,
}: {
	internalCustomerIds?: string[];
	inStatuses?: CusProductStatus[];
	plans?: ListCustomersV2Params["plans"];
	processors?: ListCustomersV2Params["processors"];
	search?: string;
}) => {
	return Boolean(
		(internalCustomerIds && internalCustomerIds.length > 0) ||
			(plans && plans.length > 0) ||
			(processors && processors.length > 0) ||
			search?.trim(),
	);
};

export const getCustomerListFilterSql = ({
	internalCustomerIds,
	inStatuses,
	plans,
	processors,
	search,
}: {
	internalCustomerIds?: string[];
	inStatuses?: CusProductStatus[];
	plans?: ListCustomersV2Params["plans"];
	processors?: ListCustomersV2Params["processors"];
	search?: string;
}) => {
	const filters = [];

	if (internalCustomerIds && internalCustomerIds.length > 0) {
		filters.push(
			sql`AND c.internal_id IN (${sql.join(
				internalCustomerIds.map((id) => sql`${id}`),
				sql`, `,
			)})`,
		);
	}

	if (plans && plans.length > 0) {
		const planConditions = plans.map((plan) => {
			if (plan.versions && plan.versions.length > 0) {
				return sql`(p_filter.id = ${plan.id} AND p_filter.version IN (${sql.join(
					plan.versions.map((version) => sql`${version}`),
					sql`, `,
				)}))`;
			}

			return sql`p_filter.id = ${plan.id}`;
		});

		filters.push(sql`AND EXISTS (
			SELECT 1
			FROM customer_products cp_filter
			JOIN products p_filter ON cp_filter.internal_product_id = p_filter.internal_id
			WHERE cp_filter.internal_customer_id = c.internal_id
				${
					inStatuses?.length
						? sql`AND cp_filter.status = ANY(ARRAY[${sql.join(
								inStatuses.map((status) => sql`${status}`),
								sql`, `,
							)}])`
						: sql``
				}
				AND (${sql.join(planConditions, sql` OR `)})
		)`);
	}

	const trimmedSearch = search?.trim();
	if (trimmedSearch) {
		const pattern = `%${trimmedSearch}%`;
		filters.push(sql`AND (
			c.id ILIKE ${pattern}
			OR c.name ILIKE ${pattern}
			OR c.email ILIKE ${pattern}
		)`);
	}

	if (processors && processors.length > 0) {
		const processorConditions = processors
			.map((proc) => {
				if (proc === "stripe") return sql`(c.processor->>'id' IS NOT NULL)`;
				if (proc === "revenuecat")
					return sql`EXISTS (
						SELECT 1
						FROM customer_products cp_processor
						WHERE cp_processor.internal_customer_id = c.internal_id
							AND cp_processor.processor->>'type' = 'revenuecat'
					)`;
				if (proc === "vercel")
					return sql`(c.processors->>'vercel' IS NOT NULL)`;
				return null;
			})
			.filter((c): c is SQL => c !== null);

		if (processorConditions.length > 0) {
			filters.push(sql`AND (${sql.join(processorConditions, sql` OR `)})`);
		}
	}

	return sql.join(filters, sql` `);
};
