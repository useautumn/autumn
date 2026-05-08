import type { AppEnv, CusProductStatus } from "@autumn/shared";
import { type SQL, sql } from "drizzle-orm";
import { RELEVANT_STATUSES } from "../../cusProducts/CusProductService.js";
import { getFullSubjectRowsQuery } from "./getFullSubjectRowsQuery.js";

const getCustomerSubjectRecordsCte = ({
	orgId,
	env,
	customerId,
	customerFilter,
	customerPagination,
}: {
	orgId: string;
	env: AppEnv;
	customerId?: string;
	customerFilter: SQL;
	customerPagination: SQL;
}) => sql`
	WITH customer_records AS (
		SELECT c.*
		FROM customers c
		WHERE c.org_id = ${orgId}
			AND c.env = ${env}
			${customerFilter}
		${customerPagination}
	),

	subject_records AS (
		SELECT
			c.internal_id AS subject_key,
			c.internal_id AS internal_customer_id,
			NULL::text AS internal_entity_id,
			ROW_NUMBER() OVER (
				ORDER BY ${
					customerId ? sql`(c.id = ${customerId}) DESC` : sql`c.created_at DESC`
				}
			) AS subject_order
		FROM customer_records c
	)
`;

const getEntityOnlySubjectRecordsCte = ({
	orgId,
	env,
	entityId,
}: {
	orgId: string;
	env: AppEnv;
	entityId: string;
}) => sql`
	WITH entity_record AS (
		SELECT e.*
		FROM entities e
		WHERE e.org_id = ${orgId}
			AND e.env = ${env}
			AND (e.id = ${entityId} OR e.internal_id = ${entityId})
		LIMIT 1
	),

	subject_records AS (
		SELECT
			e.internal_id AS subject_key,
			e.internal_customer_id,
			e.internal_id AS internal_entity_id,
			1 AS subject_order
		FROM entity_record e
	)
`;

const getCustomerEntitySubjectRecordsCte = ({
	orgId,
	env,
	entityId,
	customerFilter,
	customerPagination,
	allowMissingEntity,
}: {
	orgId: string;
	env: AppEnv;
	entityId: string;
	customerFilter: SQL;
	customerPagination: SQL;
	allowMissingEntity: boolean;
}) => {
	if (allowMissingEntity) {
		return sql`
			WITH customer_records AS (
				SELECT c.*
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
					FROM customer_records
				)
					AND (e.id = ${entityId} OR e.internal_id = ${entityId})
				LIMIT 1
			),

			subject_records AS (
				SELECT
					COALESCE(e.internal_id, c.internal_id) AS subject_key,
					c.internal_id AS internal_customer_id,
					e.internal_id AS internal_entity_id,
					1 AS subject_order
				FROM customer_records c
				LEFT JOIN entity_record e
					ON e.internal_customer_id = c.internal_id
			)
		`;
	}

	return sql`
		WITH customer_records AS (
			SELECT c.*
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
				FROM customer_records
			)
				AND (e.id = ${entityId} OR e.internal_id = ${entityId})
			LIMIT 1
		),

		subject_records AS (
			SELECT
				e.internal_id AS subject_key,
				e.internal_customer_id,
				e.internal_id AS internal_entity_id,
				1 AS subject_order
			FROM entity_record e
		)
	`;
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

	const leadingCtes =
		entityOnlyLookup && entityId
			? getEntityOnlySubjectRecordsCte({
					orgId,
					env,
					entityId,
				})
			: entityId
				? getCustomerEntitySubjectRecordsCte({
						orgId,
						env,
						entityId,
						customerFilter,
						customerPagination,
						allowMissingEntity,
					})
				: getCustomerSubjectRecordsCte({
						orgId,
						env,
						customerId,
						customerFilter,
						customerPagination,
					});

	return getFullSubjectRowsQuery({
		leadingCtes,
		inStatuses,
		includeInvoices: !entityId,
		includeEntityAggregations: !entityId,
	});
};
