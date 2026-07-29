import { filterToIr } from "../../compiler/filterToIr/filterToIr.js";
import type { ResolutionContext } from "../../compiler/filterToIr/resolutionContext.js";
import type { IRNode } from "../../compiler/ir/irTypes.js";
import {
	type AmbientContext,
	type CompiledSql,
	irToSql,
} from "../../compiler/irToSql/irToSql.js";
import { customerRegistry } from "../../compiler/registry/customerRegistry.js";
import type { CustomerFilter } from "../customerFilter.js";
import {
	buildCustomerProductWhereSql,
	buildPlanProductsSql,
	type PlanIdConstraint,
} from "./accessPaths/planPlanIdAccessPath.js";
import {
	buildCustomerCandidateQuery,
	withoutConsumedNav,
} from "./buildCustomerCandidateQuery.js";
import { chooseCustomerAccessPath } from "./chooseCustomerAccessPath.js";

/** Caller-supplied per-candidate predicate (e.g. the migration checkpoint). */
export type CustomerPagePredicate = {
	/** Bare predicate SQL correlated via `keyColumn` (the candidate-id column). */
	build: (keyColumn: string) => CompiledSql;
	/** Set when the predicate references the `c` customers alias beyond the
	 * key column — forces the customers join inside the walk. */
	needsCustomerAlias?: boolean;
};

const CUSTOMER_COLUMNS = "c.internal_id, c.id, c.name, c.email";

const isEmptyResidual = (ir: IRNode): boolean =>
	ir.kind === "and" && ir.children.length === 0;

type SqlAssembler = {
	push: (sql: string, sqlParams?: readonly unknown[]) => void;
	compile: () => CompiledSql;
};

const sqlAssembler = (): SqlAssembler => {
	const parts: string[] = [];
	const params: unknown[] = [];
	return {
		push: (sql, sqlParams = []) => {
			parts.push(sql);
			params.push(...sqlParams);
		},
		compile: () => ({ sql: parts.join(" "), params }),
	};
};

type CustomerScopeArgs = {
	filter: CustomerFilter;
	ctx: ResolutionContext;
	ambient: AmbientContext;
	predicates?: CustomerPagePredicate[];
};

/** Wraps a candidate-id subquery with the payload join over customers. */
export const wrapIdsWithCustomerColumns = ({
	ids,
	ambient,
}: {
	ids: CompiledSql;
	ambient: AmbientContext;
}): CompiledSql => {
	const query = sqlAssembler();
	query.push(`SELECT ${CUSTOMER_COLUMNS} FROM (`);
	query.push(ids.sql, ids.params);
	query.push(") m JOIN customers c ON c.internal_id = m.internal_customer_id");
	query.push("WHERE c.org_id = ? AND c.env = ?", [ambient.orgId, ambient.env]);
	query.push('ORDER BY m.internal_customer_id COLLATE "C" DESC');
	return query.compile();
};

/**
 * Bounded candidate-id page for ANY filter: a driver enumerates candidate ids
 * newest-first and EVERY predicate (residual filter, checkpoint, cursor) is
 * evaluated inside the driver, so LIMIT counts matches — a short page always
 * means the set is exhausted, never that rows were filtered away.
 */
export const composeCandidateIdPage = ({
	filter,
	ctx,
	ambient,
	limit,
	cursor,
	predicates = [],
}: CustomerScopeArgs & {
	limit: number;
	cursor?: string;
}): CompiledSql => {
	const ir = filterToIr({ filter, ctx });
	const accessPath = chooseCustomerAccessPath(ir);

	if (!accessPath) {
		return composeCustomersDriverIdPage({ ir, ambient, limit, cursor, predicates });
	}

	const residualIr = accessPath.consumedNav
		? withoutConsumedNav(ir, accessPath.consumedNav)
		: ir;
	return composePlanWalkIdPage({
		constraint: accessPath.constraint,
		residualIr,
		ambient,
		limit,
		cursor,
		predicates,
	});
};

/** Page-bounded customer query: bounded id page + payload join. */
export const composeCustomerPage = ({
	limit,
	cursor,
	...scope
}: CustomerScopeArgs & {
	limit: number;
	cursor?: string;
}): CompiledSql =>
	wrapIdsWithCustomerColumns({
		ids: composeCandidateIdPage({ ...scope, limit, cursor }),
		ambient: scope.ambient,
	});

/**
 * Unbounded candidate-id set. Two access paths, chosen by the compiler:
 * fully plan-level filters read customer_products alone (no customers join,
 * no row payloads); anything needing the customer row keeps the batch-hash
 * shape — optimal when no LIMIT can stop the scan.
 */
export const composeCustomerIdSet = ({
	filter,
	ctx,
	ambient,
	predicates = [],
}: CustomerScopeArgs): CompiledSql => {
	const ir = filterToIr({ filter, ctx });
	const accessPath = chooseCustomerAccessPath(ir);
	const decidableFromCustomerProducts =
		accessPath?.consumedNav !== undefined &&
		isEmptyResidual(withoutConsumedNav(ir, accessPath.consumedNav)) &&
		predicates.every((predicate) => !predicate.needsCustomerAlias);
	const query = sqlAssembler();

	if (decidableFromCustomerProducts && accessPath) {
		const planProducts = buildPlanProductsSql({
			constraint: accessPath.constraint,
			ambient,
		});
		const customerProductWhere = buildCustomerProductWhereSql(
			accessPath.constraint,
		);

		query.push("SELECT cp.internal_customer_id FROM customer_products cp");
		query.push("WHERE cp.internal_product_id IN (");
		query.push(planProducts.sql, planProducts.params);
		query.push(")");
		query.push(`AND ${customerProductWhere.sql}`, customerProductWhere.params);
		for (const predicate of predicates) {
			const compiled = predicate.build("cp.internal_customer_id");
			query.push(`AND ${compiled.sql}`, compiled.params);
		}
		query.push("GROUP BY cp.internal_customer_id");
		return query.compile();
	}

	const candidate = buildCustomerCandidateQuery({ filter, ctx, ambient });
	query.push("SELECT c.internal_id AS internal_customer_id FROM");
	query.push(candidate.source.sql, candidate.source.params);
	query.push(`WHERE (${candidate.where.sql})`, candidate.where.params);
	for (const predicate of predicates) {
		const compiled = predicate.build("c.internal_id");
		query.push(`AND ${compiled.sql}`, compiled.params);
	}
	return query.compile();
};

/** Full-set count over the candidate-id set. */
export const composeCustomerCount = (args: CustomerScopeArgs): CompiledSql => {
	const idSet = composeCustomerIdSet(args);
	return {
		sql: `SELECT COUNT(*)::bigint AS count FROM ( ${idSet.sql} ) matched`,
		params: idSet.params,
	};
};

/** Driver: ordered index walks of customer_products, one per plan product. */
const composePlanWalkIdPage = ({
	constraint,
	residualIr,
	ambient,
	limit,
	cursor,
	predicates,
}: {
	constraint: PlanIdConstraint;
	residualIr: IRNode;
	ambient: AmbientContext;
	limit: number;
	cursor?: string;
	predicates: CustomerPagePredicate[];
}): CompiledSql => {
	const planProducts = buildPlanProductsSql({ constraint, ambient });
	const customerProductWhere = buildCustomerProductWhereSql(constraint);
	const residual = isEmptyResidual(residualIr)
		? undefined
		: irToSql({ ir: residualIr, root: customerRegistry, ambient });
	const joinCustomersInWalk =
		residual !== undefined ||
		predicates.some((predicate) => predicate.needsCustomerAlias);
	const query = sqlAssembler();

	query.push(
		'SELECT DISTINCT ON (walk.internal_customer_id COLLATE "C") walk.internal_customer_id',
	);
	query.push("FROM (");
	query.push(planProducts.sql, planProducts.params);
	query.push(") plans CROSS JOIN LATERAL (");
	query.push(
		'SELECT DISTINCT ON (cp.internal_customer_id COLLATE "C") cp.internal_customer_id',
	);
	query.push("FROM customer_products cp");
	if (joinCustomersInWalk) {
		query.push("JOIN customers c ON c.internal_id = cp.internal_customer_id");
	}
	query.push("WHERE cp.internal_product_id = plans.internal_id");
	query.push(`AND ${customerProductWhere.sql}`, customerProductWhere.params);
	if (cursor !== undefined) {
		query.push('AND cp.internal_customer_id COLLATE "C" < ?', [cursor]);
	}
	if (residual) {
		query.push(`AND (${residual.sql})`, residual.params);
	}
	for (const predicate of predicates) {
		const compiled = predicate.build("cp.internal_customer_id");
		query.push(`AND ${compiled.sql}`, compiled.params);
	}
	query.push('ORDER BY cp.internal_customer_id COLLATE "C" DESC LIMIT ?', [
		limit,
	]);
	query.push(") walk");
	query.push('ORDER BY walk.internal_customer_id COLLATE "C" DESC LIMIT ?', [
		limit,
	]);
	return query.compile();
};

/** Driver: ordered walk of customers itself (filters with no plan access
 * path). Same shape as the legacy fallback query — LIMIT is post-filter. */
const composeCustomersDriverIdPage = ({
	ir,
	ambient,
	limit,
	cursor,
	predicates,
}: {
	ir: IRNode;
	ambient: AmbientContext;
	limit: number;
	cursor?: string;
	predicates: CustomerPagePredicate[];
}): CompiledSql => {
	const where = irToSql({ ir, root: customerRegistry, ambient });
	const query = sqlAssembler();

	query.push("SELECT c.internal_id AS internal_customer_id FROM customers c");
	query.push(`WHERE (${where.sql})`, where.params);
	if (cursor !== undefined) {
		query.push("AND c.internal_id < ?", [cursor]);
	}
	for (const predicate of predicates) {
		const compiled = predicate.build("c.internal_id");
		query.push(`AND ${compiled.sql}`, compiled.params);
	}
	query.push("ORDER BY c.internal_id DESC LIMIT ?", [limit]);
	return query.compile();
};
