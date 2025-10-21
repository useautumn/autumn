import { type SQL, sql } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import type { CTEConfig } from "../buildCte.js";
import {
	buildRelationGraph,
	getTableName,
	parseJoinCondition,
	type RelationNode,
} from "./relationGraph.js";

/**
 * Build the optimized query using JOIN + GROUP BY strategy
 * This replaces correlated subqueries with flat JOINs for better performance
 */
export function buildJoinGroupByQuery({
	config,
	relations,
	extractJoinCondition,
}: {
	config: CTEConfig;
	relations: Record<string, any>;
	extractJoinCondition: (params: {
		parentTable: PgTable;
		targetTable: PgTable;
		fieldName: string;
	}) => SQL | undefined;
}): SQL {
	// Build relation graph
	const rootTable = getSourceTable(config.from);
	const graph = buildRelationGraph({
		config,
		relations,
		extractJoinCondition,
	});

	// Step 1: Build aggregation CTEs for array (one-to-many) relations
	const aggregationCTEs = buildAggregationCTEs({ graph, rootTable });

	// Step 2: Build main query with row (one-to-one) relations as direct JOINs
	const mainQuery = buildMainQuery({ graph, config });

	// Step 3: Assemble final query with CTEs if needed
	if (aggregationCTEs.length > 0) {
		const cteDefinitions = aggregationCTEs.map((c) => c.definition);
		return sql`WITH ${sql.join(cteDefinitions, sql`, `)} ${mainQuery}`;
	}

	return mainQuery;
}

/**
 * Build the main SELECT query with direct JOINs for row relations
 */
function buildMainQuery({
	graph,
	config,
}: {
	graph: RelationNode;
	config: CTEConfig;
}): SQL {
	const selectFields: SQL[] = [];
	const joins: SQL[] = [];
	const groupByFields: SQL[] = [];

	// Add root table columns
	selectFields.push(sql`${sql.identifier(graph.tableName)}.*`);
	groupByFields.push(sql`${sql.identifier(graph.tableName)}.id`);

	// Recursively add JOINs and SELECT fields for nested relations
	addNestedJoins({
		node: graph,
		parentTableName: graph.tableName,
		path: [],
		selectFields,
		joins,
		groupByFields,
	});

	// Build the base query
	let query = sql`SELECT ${sql.join(selectFields, sql`, `)} FROM ${sql.identifier(graph.tableName)}`;

	// Add JOINs
	if (joins.length > 0) {
		query = sql`${query} ${sql.join(joins, sql` `)}`;
	}

	// Add WHERE clause
	if (config.where) {
		query = sql`${query} WHERE ${config.where}`;
	}

	// Add GROUP BY (needed when we have array aggregations)
	if (groupByFields.length > 1) {
		query = sql`${query} GROUP BY ${sql.join(groupByFields, sql`, `)}`;
	}

	// Add ORDER BY
	if (config.orderBy && config.orderBy.length > 0) {
		query = sql`${query} ORDER BY ${sql.join(config.orderBy, sql`, `)}`;
	}

	// Add LIMIT
	if (config.limit !== undefined) {
		query = sql`${query} LIMIT ${sql.raw(String(config.limit))}`;
	}

	// Add OFFSET
	if (config.offset !== undefined) {
		query = sql`${query} OFFSET ${sql.raw(String(config.offset))}`;
	}

	return query;
}

/**
 * Recursively add JOINs for nested relations
 */
function addNestedJoins({
	node,
	parentTableName,
	path,
	selectFields,
	joins,
	groupByFields,
}: {
	node: RelationNode;
	parentTableName: string;
	path: string[];
	selectFields: SQL[];
	joins: SQL[];
	groupByFields: SQL[];
}) {
	for (const [fieldName, childNode] of Object.entries(node.nestedFields)) {
		const childAlias = [...path, fieldName].join("_");

		if (childNode.mode === "row") {
			// For row relations (one-to-one), add direct JOIN
			joins.push(sql`
				LEFT JOIN ${sql.identifier(childNode.tableName)} AS ${sql.identifier(childAlias)}
				ON ${sql.identifier(childAlias)}.${sql.identifier(childNode.childKey || "id")} = ${sql.identifier(parentTableName)}.${sql.identifier(childNode.parentKey || "id")}
			`);

			// Add to GROUP BY
			groupByFields.push(
				sql`${sql.identifier(childAlias)}.${sql.identifier(childNode.childKey || "id")}`,
			);

			// Add to SELECT as row_to_json
			selectFields.push(
				sql`row_to_json(${sql.identifier(childAlias)}) AS ${sql.identifier(fieldName)}`,
			);

			// Recurse for nested row relations
			addNestedJoins({
				node: childNode,
				parentTableName: childAlias,
				path: [...path, fieldName],
				selectFields,
				joins,
				groupByFields,
			});
		} else {
			// For array relations, we'll use aggregation CTEs
			// Add the aggregated field from the CTE
			const aggCTEName = [...path, fieldName, "agg"].join("_");
			selectFields.push(
				sql`COALESCE(${sql.identifier(aggCTEName)}.${sql.identifier(fieldName)}, '[]'::json) AS ${sql.identifier(fieldName)}`,
			);

			// The CTE will be built separately and joined
			joins.push(sql`
				LEFT JOIN ${sql.identifier(aggCTEName)}
				ON ${sql.identifier(aggCTEName)}.group_key = ${sql.identifier(parentTableName)}.id
			`);
		}
	}
}

/**
 * Build aggregation CTEs for array (one-to-many) relations
 */
function buildAggregationCTEs({
	graph,
	rootTable,
}: {
	graph: RelationNode;
	rootTable: PgTable;
}): Array<{ name: string; definition: SQL }> {
	const ctes: Array<{ name: string; definition: SQL }> = [];

	function processNode({
		node,
		parentTableName,
		path,
	}: {
		node: RelationNode;
		parentTableName: string;
		path: string[];
	}) {
		for (const [fieldName, childNode] of Object.entries(node.nestedFields)) {
			if (childNode.mode === "array") {
				const cteName = [...path, fieldName, "agg"].join("_");

				// Build SELECT fields for the aggregation
				const selectFields: SQL[] = [
					sql`${sql.identifier(childNode.tableName)}.*`,
				];

				// Add nested row relations as inline row_to_json
				for (const [nestedFieldName, nestedNode] of Object.entries(
					childNode.nestedFields,
				)) {
					if (nestedNode.mode === "row") {
						selectFields.push(
							sql`row_to_json(${sql.identifier(nestedFieldName)}) AS ${sql.identifier(nestedFieldName)}`,
						);
					}
				}

				// Build JOINs for nested row relations
				const nestedJoins: SQL[] = [];
				for (const [nestedFieldName, nestedNode] of Object.entries(
					childNode.nestedFields,
				)) {
					if (nestedNode.mode === "row") {
						nestedJoins.push(sql`
							LEFT JOIN ${sql.identifier(nestedNode.tableName)} AS ${sql.identifier(nestedFieldName)}
							ON ${sql.identifier(nestedFieldName)}.${sql.identifier(nestedNode.childKey || "id")} = ${sql.identifier(childNode.tableName)}.${sql.identifier(nestedNode.parentKey || "id")}
						`);
					}
				}

				// Build the aggregation query
				let innerQuery = sql`
					SELECT
						${sql.identifier(childNode.tableName)}.${sql.identifier(childNode.parentKey || "id")} AS group_key,
						COALESCE(
							json_agg(
								row_to_json(agg_sub)
								ORDER BY ${sql.identifier(childNode.tableName)}.created_at DESC
							),
							'[]'::json
						) AS ${sql.identifier(fieldName)}
					FROM ${sql.identifier(childNode.tableName)}
				`;

				// Add nested JOINs
				if (nestedJoins.length > 0) {
					innerQuery = sql`${innerQuery} ${sql.join(nestedJoins, sql` `)}`;
				}

				// Add WHERE to filter by parent IDs
				innerQuery = sql`${innerQuery}
					WHERE ${sql.identifier(childNode.tableName)}.${sql.identifier(childNode.parentKey || "id")} IN (
						SELECT id FROM ${sql.identifier(parentTableName)}
					)
				`;

				// Add additional filters from config
				if (childNode.config.where) {
					innerQuery = sql`${innerQuery} AND ${childNode.config.where}`;
				}

				// Add GROUP BY
				innerQuery = sql`${innerQuery}
					GROUP BY ${sql.identifier(childNode.tableName)}.${sql.identifier(childNode.parentKey || "id")}
				`;

				// Wrap in CTE
				const cteDefinition = sql`${sql.identifier(cteName)} AS (
					${innerQuery}
				)`;

				ctes.push({
					name: cteName,
					definition: cteDefinition,
				});

				// Recurse for nested array relations
				processNode({
					node: childNode,
					parentTableName: childNode.tableName,
					path: [...path, fieldName],
				});
			} else {
				// For row relations, continue recursion
				processNode({
					node: childNode,
					parentTableName: childNode.tableName,
					path: [...path, fieldName],
				});
			}
		}
	}

	processNode({
		node: graph,
		parentTableName: graph.tableName,
		path: [],
	});

	return ctes;
}

/**
 * Get source table from config (unwrap CTEBuilder if needed)
 */
function getSourceTable(from: any): PgTable {
	if (from?.config?.from) {
		return getSourceTable(from.config.from);
	}
	return from;
}
