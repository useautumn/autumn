import type { AppEnv, CusProductStatus, ListCustomersV2Params } from "@autumn/shared";
import { sql } from "drizzle-orm";
import { getCustomerListFilterSql } from "../src/internal/customers/getFullCusQuery";

export type CursorPaginatedFullCusQueryArgs = {
	orgId: string;
	env: AppEnv;
	inStatuses?: CusProductStatus[];
	includeInvoices: boolean;
	withEntities: boolean;
	withTrialsUsed: boolean;
	withSubs: boolean;
	limit: number;
	cursor?: { createdAt: number; id: string };
	withEvents?: boolean;
	internalCustomerIds?: string[];
	plans?: ListCustomersV2Params["plans"];
	processors?: ListCustomersV2Params["processors"];
	search?: string;
	cusProductLimit: number;
};

export const getCursorPaginatedFullCusQuery = ({
	orgId,
	env,
	inStatuses,
	includeInvoices,
	withEntities,
	withTrialsUsed,
	withSubs,
	limit,
	cursor,
	withEvents = false,
	internalCustomerIds,
	plans,
	processors,
	search,
	cusProductLimit,
}: CursorPaginatedFullCusQueryArgs) => {
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
		processors,
		search,
	});

	const cursorPredicate = cursor
		? sql`AND (c.created_at, c.id) < (${cursor.createdAt}, ${cursor.id})`
		: sql``;

	const fetchLimit = limit + 1;

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
	      ${cursorPredicate}
      ORDER BY c.created_at DESC, c.id DESC
      LIMIT ${fetchLimit}
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
        LIMIT 300
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
    ORDER BY cr.created_at DESC, cr.id DESC
  `;
};
