import type { AppEnv, CusProductStatus } from "@autumn/shared";
import { type SQL, sql } from "drizzle-orm";
import { RELEVANT_STATUSES } from "../../cusProducts/CusProductService.js";
import { getEntityAggregateFragments } from "./getEntityAggregateFragments.js";

const getCustomerOrEntityCTE = ({
	orgId,
	env,
	entityId,
	entityOnlyLookup,
	customerFilter,
	customerPagination,
}: {
	orgId: string;
	env: AppEnv;
	entityId?: string;
	entityOnlyLookup: boolean;
	customerFilter: SQL;
	customerPagination: SQL;
}): SQL => {
	if (entityOnlyLookup && entityId) {
		return sql`
		WITH entity_record AS (
			SELECT e.*
			FROM entities e
			WHERE e.org_id = ${orgId}
				AND e.env = ${env}
				AND (e.id = ${entityId} OR e.internal_id = ${entityId})
			LIMIT 1
		),
		subject_customer_records AS (
			SELECT c.*
			FROM customers c
			WHERE c.internal_id = (SELECT internal_customer_id FROM entity_record LIMIT 1)
		)`;
	}

	if (entityId) {
		return sql`
		WITH subject_customer_records AS (
			SELECT *
			FROM customers c
			WHERE c.org_id = ${orgId}
				AND c.env = ${env}
				${customerFilter}
			${customerPagination}
		),
		entity_record AS (
			SELECT e.*
			FROM entities e
			WHERE e.internal_customer_id IN (
				SELECT internal_id
				FROM subject_customer_records
			)
				AND (e.id = ${entityId} OR e.internal_id = ${entityId})
			LIMIT 1
		)`;
	}

	return sql`
		WITH subject_customer_records AS (
			SELECT *
			FROM customers c
			WHERE c.org_id = ${orgId}
				AND c.env = ${env}
				${customerFilter}
			${customerPagination}
		)`;
};

export const getFullSubjectQuery = ({
	orgId,
	env,
	customerId,
	entityId,
	pagination = {
		page: 50,
		offset: 0,
	},
	inStatuses = RELEVANT_STATUSES,
	allowMissingEntity = false,
}: {
	orgId: string;
	env: AppEnv;
	customerId?: string;
	entityId?: string;
	pagination?: {
		page?: number;
		offset?: number;
	};
	inStatuses?: CusProductStatus[];
	// When true and both customerId + entityId are provided, return the
	// customer-scoped row even if the entity does not exist. No-op when
	// customerId is absent (entity-only lookup has no customer anchor).
	allowMissingEntity?: boolean;
}) => {
	const page = pagination.page ?? 50;
	const offset = pagination.offset ?? 0;
	const entityOnlyLookup = !!entityId && !customerId;

	const statusFilter =
		inStatuses.length > 0
			? sql`AND cp.status = ANY(ARRAY[${sql.join(
					inStatuses.map((status) => sql`${status}`),
					sql`, `,
				)}])`
			: sql``;

	const customerFilter = customerId
		? sql`AND (c.id = ${customerId} OR c.internal_id = ${customerId})`
		: sql``;

	const customerPagination = customerId
		? sql`
			ORDER BY (c.id = ${customerId}) DESC
			LIMIT 1
		`
		: sql`
			ORDER BY c.created_at DESC
			LIMIT ${page}
			OFFSET ${offset}
		`;

	const leadingCtes = getCustomerOrEntityCTE({
		orgId,
		env,
		entityId,
		entityOnlyLookup,
		customerFilter,
		customerPagination,
	});

	const customerProductEntityFilter = entityId
		? sql`AND (cp.internal_entity_id = (SELECT internal_id FROM entity_record LIMIT 1)
				OR cp.internal_entity_id IS NULL)`
		: sql`AND cp.internal_entity_id IS NULL`;

	const entityFragments = getEntityAggregateFragments({
		entityId,
		statusFilter,
	});

	const allowEntityFallback =
		allowMissingEntity && !!customerId && !entityOnlyLookup;

	const subjectCustomerFilter =
		entityId && !allowEntityFallback
			? sql`
			WHERE scr.internal_id = (
				SELECT internal_customer_id
				FROM entity_record
				LIMIT 1
			)
		`
			: sql``;

	const extraCustomerEntitlementEntityFilter = entityId
		? sql`
			AND (
				ce.internal_entity_id IS NULL
				OR ce.internal_entity_id = (SELECT internal_id FROM entity_record LIMIT 1)
			)
		`
		: sql`AND ce.internal_entity_id IS NULL`;

	const subscriptionsCte = sql`,

		customer_subscriptions AS (
			SELECT DISTINCT s.*
			FROM cus_products cp
			JOIN LATERAL unnest(cp.subscription_ids) AS cp_sub(stripe_id) ON true
			JOIN subscriptions s ON s.stripe_id = cp_sub.stripe_id
		)`;

	const invoicesCte = entityId
		? sql``
		: sql`,

		customer_invoices AS (
			SELECT *
			FROM invoices i
			WHERE i.internal_customer_id IN (SELECT internal_id FROM subject_customer_records)
			ORDER BY i.created_at DESC, i.id DESC
			LIMIT 10
		)`;

	const subscriptionsSelect = sql`,

			COALESCE(
				(
					SELECT json_agg(row_to_json(cs)) FILTER (WHERE cs.stripe_id IS NOT NULL)
					FROM customer_subscriptions cs
				),
				'[]'::json
			) AS subscriptions`;

	const invoicesSelect = entityId
		? sql``
		: sql`,

			COALESCE(
				(
					SELECT json_agg(row_to_json(ci) ORDER BY ci.created_at DESC, ci.id DESC)
						FILTER (WHERE ci.id IS NOT NULL)
					FROM customer_invoices ci
					WHERE ci.internal_customer_id = scr.internal_id
				),
				'[]'::json
			) AS invoices`;

	const entitySelect = entityId
		? sql`,

			(SELECT row_to_json(er) FROM entity_record er LIMIT 1) AS entity`
		: sql``;

	return sql`
		${leadingCtes}
		,

		cus_products AS (
			SELECT cp.*
			FROM customer_products cp
			JOIN subject_customer_records scr
				ON cp.internal_customer_id = scr.internal_id
			WHERE 1 = 1
				${customerProductEntityFilter}
				${statusFilter}
		),

		cus_entitlements AS (
			SELECT ce.*
			FROM customer_entitlements ce
			WHERE ce.customer_product_id IN (SELECT id FROM cus_products)
		),

		extra_cus_entitlements AS (
			SELECT ce.*
			FROM customer_entitlements ce
			JOIN subject_customer_records scr
				ON ce.internal_customer_id = scr.internal_id
			WHERE ce.customer_product_id IS NULL
				AND (ce.expires_at IS NULL OR ce.expires_at > EXTRACT(EPOCH FROM now()) * 1000)
				AND (
					ce.balance != 0
					OR ce.unlimited IS TRUE
					OR EXISTS (
						SELECT 1
						FROM entitlements e
						JOIN features f ON f.internal_id = e.internal_feature_id
						WHERE e.id = ce.entitlement_id
							AND f.type = 'boolean'
					)
				)
				${extraCustomerEntitlementEntityFilter}
			LIMIT 20
		),

		all_cus_ent_ids AS (
			SELECT id FROM cus_entitlements
			UNION ALL
			SELECT id FROM extra_cus_entitlements
		),

		cus_rollovers AS (
			SELECT ro.*
			FROM rollovers ro
			WHERE ro.cus_ent_id IN (SELECT id FROM all_cus_ent_ids)
				AND (ro.expires_at IS NULL OR ro.expires_at > EXTRACT(EPOCH FROM now()) * 1000)
		),

		cus_replaceables AS (
			SELECT rep.*
			FROM replaceables rep
			WHERE rep.cus_ent_id IN (SELECT id FROM all_cus_ent_ids)
		),

		cus_prices AS (
			SELECT cpr.*
			FROM customer_prices cpr
			WHERE cpr.customer_product_id IN (SELECT id FROM cus_products)
		)

		${subscriptionsCte}
		${invoicesCte}
		${entityFragments.ctes}
		,

		distinct_products AS (
			SELECT DISTINCT ON (src.internal_customer_id, p.internal_id)
				src.internal_customer_id,
				p.*
			FROM products p
			JOIN (
				SELECT cp.internal_customer_id, cp.internal_product_id FROM cus_products cp
				${entityFragments.productRefsUnion}
			) src ON p.internal_id = src.internal_product_id
			ORDER BY src.internal_customer_id, p.internal_id
		),

		relevant_entitlement_records AS (
			SELECT DISTINCT
				ce.internal_customer_id,
				ce.entitlement_id
			FROM cus_entitlements ce
			UNION
			SELECT DISTINCT
				ece.internal_customer_id,
				ece.entitlement_id
			FROM extra_cus_entitlements ece
			${entityFragments.entitlementRefsUnion}
		),

		distinct_entitlements AS (
			SELECT
				rer.internal_customer_id,
				e.*,
				row_to_json(f) AS feature
			FROM relevant_entitlement_records rer
			JOIN entitlements e
				ON e.id = rer.entitlement_id
			JOIN features f
				ON e.internal_feature_id = f.internal_id
		),

		distinct_prices AS (
			SELECT DISTINCT ON (src.internal_customer_id, p.id)
				src.internal_customer_id,
				p.*
			FROM prices p
			JOIN (
				SELECT cpr.price_id, cp.internal_customer_id
				FROM cus_prices cpr
				JOIN cus_products cp ON cp.id = cpr.customer_product_id
				${entityFragments.priceRefsUnion}
			) src ON p.id = src.price_id
			ORDER BY src.internal_customer_id, p.id
		),

		distinct_free_trials AS (
			SELECT DISTINCT ON (src.internal_customer_id, ft.id)
				src.internal_customer_id,
				ft.*
			FROM free_trials ft
			JOIN (
				SELECT cp.free_trial_id, cp.internal_customer_id
				FROM cus_products cp
				WHERE cp.free_trial_id IS NOT NULL
				${entityFragments.freeTrialRefsUnion}
			) src ON ft.id = src.free_trial_id
			ORDER BY src.internal_customer_id, ft.id
		)

		SELECT
			row_to_json(scr) AS customer,

			COALESCE(
				(
					SELECT json_agg(row_to_json(cp))
					FROM cus_products cp
					WHERE cp.internal_customer_id = scr.internal_id
				),
				'[]'::json
			) AS customer_products,

			COALESCE(
				(
					SELECT json_agg(row_to_json(ce))
					FROM cus_entitlements ce
					WHERE ce.internal_customer_id = scr.internal_id
				),
				'[]'::json
			) AS customer_entitlements,

			COALESCE(
				(
					SELECT json_agg(row_to_json(cpr))
					FROM cus_prices cpr
					JOIN cus_products cp
						ON cp.id = cpr.customer_product_id
					WHERE cp.internal_customer_id = scr.internal_id
				),
				'[]'::json
			) AS customer_prices,

			COALESCE(
				(
					SELECT json_agg(row_to_json(ece))
					FROM extra_cus_entitlements ece
					WHERE ece.internal_customer_id = scr.internal_id
				),
				'[]'::json
			) AS extra_customer_entitlements,

			COALESCE(
				(
					SELECT json_agg(row_to_json(rep) ORDER BY rep.created_at ASC, rep.id ASC)
					FROM cus_replaceables rep
					WHERE rep.cus_ent_id IN (
						SELECT ce.id
						FROM cus_entitlements ce
						WHERE ce.internal_customer_id = scr.internal_id
						UNION ALL
						SELECT ece.id
						FROM extra_cus_entitlements ece
						WHERE ece.internal_customer_id = scr.internal_id
					)
				),
				'[]'::json
			) AS replaceables,

			COALESCE(
				(
					SELECT json_agg(
						row_to_json(ro)
						ORDER BY ro.expires_at ASC NULLS LAST, ro.id ASC
					)
					FROM cus_rollovers ro
					WHERE ro.cus_ent_id IN (
						SELECT ce.id
						FROM cus_entitlements ce
						WHERE ce.internal_customer_id = scr.internal_id
						UNION ALL
						SELECT ece.id
						FROM extra_cus_entitlements ece
						WHERE ece.internal_customer_id = scr.internal_id
					)
				),
				'[]'::json
			) AS rollovers,

			COALESCE(
				(
					SELECT json_agg((row_to_json(p)::jsonb - 'internal_customer_id')::json)
					FROM distinct_products p
					WHERE p.internal_customer_id = scr.internal_id
				),
				'[]'::json
			) AS products,

			COALESCE(
				(
					SELECT json_agg((row_to_json(ent)::jsonb - 'internal_customer_id')::json)
					FROM distinct_entitlements ent
					WHERE ent.internal_customer_id = scr.internal_id
				),
				'[]'::json
			) AS entitlements,

			COALESCE(
				(
					SELECT json_agg((row_to_json(pr)::jsonb - 'internal_customer_id')::json)
					FROM distinct_prices pr
					WHERE pr.internal_customer_id = scr.internal_id
				),
				'[]'::json
			) AS prices,

			COALESCE(
				(
					SELECT json_agg((row_to_json(ft)::jsonb - 'internal_customer_id')::json)
					FROM distinct_free_trials ft
					WHERE ft.internal_customer_id = scr.internal_id
				),
				'[]'::json
			) AS free_trials

			${subscriptionsSelect}
			${invoicesSelect}
			${entitySelect}
			${entityFragments.selectColumns}

		FROM subject_customer_records scr
		${subjectCustomerFilter}
	`;
};
