import type { ResolutionContext } from "../../compiler/filterToIr/resolutionContext.js";
import type {
	AmbientContext,
	CompiledSql,
} from "../../compiler/irToSql/irToSql.js";
import type { CustomerFilter } from "../customerFilter.js";
import {
	composeCandidateIdPage,
	composeCustomerIdSet,
	type CustomerPagePredicate,
	wrapIdsWithCustomerColumns,
} from "./composeCustomerPage.js";

/** The already-processed side of a migration preview. */
export type ProcessedScope = { migrationInternalId: string };

type PreviewArgs = {
	filter: CustomerFilter;
	ctx: ResolutionContext;
	ambient: AmbientContext;
	processed: ProcessedScope;
	predicates?: CustomerPagePredicate[];
};

/** Bounded walk of the migration's processed ids in customer order (the
 * live C-collation mir index). Same exactness rule as the filter walk:
 * every predicate applies inside, short page ⟹ exhausted. */
const composeProcessedIdPage = ({
	processed,
	limit,
	cursor,
	predicates = [],
}: {
	processed: ProcessedScope;
	limit: number;
	cursor?: string;
	predicates?: CustomerPagePredicate[];
}): CompiledSql => {
	const parts: string[] = [];
	const params: unknown[] = [];
	const push = (sql: string, sqlParams: readonly unknown[] = []) => {
		parts.push(sql);
		params.push(...sqlParams);
	};

	push(
		'SELECT DISTINCT ON (mir.item_id COLLATE "C") mir.item_id AS internal_customer_id',
	);
	push("FROM migration_item_runs mir");
	if (predicates.some((predicate) => predicate.needsCustomerAlias)) {
		push("JOIN customers c ON c.internal_id = mir.item_id");
	}
	push("WHERE mir.migration_internal_id = ?", [processed.migrationInternalId]);
	push("AND mir.item_kind = 'customer' AND mir.dry_run = false");
	if (cursor !== undefined) {
		push('AND mir.item_id COLLATE "C" < ?', [cursor]);
	}
	for (const predicate of predicates) {
		const compiled = predicate.build("mir.item_id");
		push(`AND ${compiled.sql}`, compiled.params);
	}
	push('ORDER BY mir.item_id COLLATE "C" DESC LIMIT ?', [limit]);
	return { sql: parts.join(" "), params };
};

/** Unbounded processed-id set (skinny, mir index only). */
const composeProcessedIdSet = ({
	processed,
	predicates = [],
}: {
	processed: ProcessedScope;
	predicates?: CustomerPagePredicate[];
}): CompiledSql => {
	const parts: string[] = [];
	const params: unknown[] = [];
	const push = (sql: string, sqlParams: readonly unknown[] = []) => {
		parts.push(sql);
		params.push(...sqlParams);
	};

	push("SELECT mir.item_id AS internal_customer_id FROM migration_item_runs mir");
	if (predicates.some((predicate) => predicate.needsCustomerAlias)) {
		push("JOIN customers c ON c.internal_id = mir.item_id");
	}
	push("WHERE mir.migration_internal_id = ?", [processed.migrationInternalId]);
	push("AND mir.item_kind = 'customer' AND mir.dry_run = false");
	for (const predicate of predicates) {
		const compiled = predicate.build("mir.item_id");
		push(`AND ${compiled.sql}`, compiled.params);
	}
	return { sql: parts.join(" "), params };
};

/**
 * Preview page: filter-set ∪ processed-set (customers an in-flight migration
 * already ran for, even when the live filter no longer matches them). Both
 * branches are bounded walks, so the union page is exact and O(page).
 */
export const composeCustomerPreviewPage = ({
	filter,
	ctx,
	ambient,
	processed,
	limit,
	cursor,
	predicates = [],
}: PreviewArgs & {
	limit: number;
	cursor?: string;
}): CompiledSql => {
	const filterIds = composeCandidateIdPage({
		filter,
		ctx,
		ambient,
		limit,
		cursor,
		predicates,
	});
	const processedIds = composeProcessedIdPage({
		processed,
		limit,
		cursor,
		predicates,
	});

	const union: CompiledSql = {
		sql: [
			"SELECT internal_customer_id FROM (",
			`( ${filterIds.sql} )`,
			"UNION",
			`( ${processedIds.sql} )`,
			") u",
			'ORDER BY internal_customer_id COLLATE "C" DESC LIMIT ?',
		].join(" "),
		params: [...filterIds.params, ...processedIds.params, limit],
	};
	return wrapIdsWithCustomerColumns({ ids: union, ambient });
};

/** Preview count: distinct union of the two id sets — customers table is
 * never touched unless a predicate needs it. */
export const composeCustomerPreviewCount = ({
	filter,
	ctx,
	ambient,
	processed,
	predicates = [],
}: PreviewArgs): CompiledSql => {
	const filterIds = composeCustomerIdSet({ filter, ctx, ambient, predicates });
	const processedIds = composeProcessedIdSet({ processed, predicates });
	return {
		sql: [
			"SELECT COUNT(*)::bigint AS count FROM (",
			`( ${filterIds.sql} )`,
			"UNION",
			`( ${processedIds.sql} )`,
			") matched",
		].join(" "),
		params: [...filterIds.params, ...processedIds.params],
	};
};
