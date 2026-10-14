import { type SQL, sql } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import type { CTEConfig } from "../buildCte.js";
import { buildRelationGraph, type RelationNode } from "./relationGraph.js";

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
	const graph = buildRelationGraph({
		config,
		relations,
		extractJoinCondition,
	});

	const aggregationCTEs = buildAggregationCTEs({ graph });

	const mainQuery = buildMainQuery({ graph, config });

	if (aggregationCTEs.length > 0) {
		const cteDefinitions = aggregationCTEs.map((c) => c.definition);
		return sql`WITH ${sql.join(cteDefinitions, sql`, `)} ${mainQuery}`;
	}

	return mainQuery;
}

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

	selectFields.push(sql`${sql.identifier(graph.tableName)}.*`);
	groupByFields.push(sql`${sql.identifier(graph.tableName)}.id`);

	addNestedJoins({
		node: graph,
		parentTableName: graph.tableName,
		path: [],
		selectFields,
		joins,
		groupByFields,
	});

	let query = sql`SELECT ${sql.join(selectFields, sql`, `)} FROM ${sql.identifier(graph.tableName)}`;

	if (joins.length > 0) {
		query = sql`${query} ${sql.join(joins, sql` `)}`;
	}

	if (config.where) {
		query = sql`${query} WHERE ${config.where}`;
	}

	if (groupByFields.length > 1) {
		query = sql`${query} GROUP BY ${sql.join(groupByFields, sql`, `)}`;
	}

	if (config.orderBy && config.orderBy.length > 0) {
		query = sql`${query} ORDER BY ${sql.join(config.orderBy, sql`, `)}`;
	}

	if (config.limit !== undefined) {
		query = sql`${query} LIMIT ${sql.raw(String(config.limit))}`;
	}

	if (config.offset !== undefined) {
		query = sql`${query} OFFSET ${sql.raw(String(config.offset))}`;
	}

	return query;
}

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
			joins.push(sql`
				LEFT JOIN ${sql.identifier(childNode.tableName)} AS ${sql.identifier(childAlias)}
				ON ${sql.identifier(childAlias)}.${sql.identifier(childNode.childKey || "id")} = ${sql.identifier(parentTableName)}.${sql.identifier(childNode.parentKey || "id")}
			`);

			groupByFields.push(
				sql`${sql.identifier(childAlias)}.${sql.identifier(childNode.childKey || "id")}`,
			);

			selectFields.push(
				sql`row_to_json(${sql.identifier(childAlias)}) AS ${sql.identifier(fieldName)}`,
			);

			addNestedJoins({
				node: childNode,
				parentTableName: childAlias,
				path: [...path, fieldName],
				selectFields,
				joins,
				groupByFields,
			});
		} else {
			const aggCTEName = [...path, fieldName, "agg"].join("_");
			selectFields.push(
				sql`COALESCE(${sql.identifier(aggCTEName)}.${sql.identifier(fieldName)}, '[]'::json) AS ${sql.identifier(fieldName)}`,
			);

			joins.push(sql`
				LEFT JOIN ${sql.identifier(aggCTEName)}
				ON ${sql.identifier(aggCTEName)}.group_key = ${sql.identifier(parentTableName)}.id
			`);
		}
	}
}

function buildAggregationCTEs({
	graph,
}: {
	graph: RelationNode;
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

				const selectFields: SQL[] = [
					sql`${sql.identifier(childNode.tableName)}.*`,
				];

				for (const [nestedFieldName, nestedNode] of Object.entries(
					childNode.nestedFields,
				)) {
					if (nestedNode.mode === "row") {
						selectFields.push(
							sql`row_to_json(${sql.identifier(nestedFieldName)}) AS ${sql.identifier(nestedFieldName)}`,
						);
					}
				}

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

				if (nestedJoins.length > 0) {
					innerQuery = sql`${innerQuery} ${sql.join(nestedJoins, sql` `)}`;
				}

				innerQuery = sql`${innerQuery}
					WHERE ${sql.identifier(childNode.tableName)}.${sql.identifier(childNode.parentKey || "id")} IN (
						SELECT id FROM ${sql.identifier(parentTableName)}
					)
				`;

				if (childNode.config.where) {
					innerQuery = sql`${innerQuery} AND ${childNode.config.where}`;
				}

				innerQuery = sql`${innerQuery}
					GROUP BY ${sql.identifier(childNode.tableName)}.${sql.identifier(childNode.parentKey || "id")}
				`;

				const cteDefinition = sql`${sql.identifier(cteName)} AS (
					${innerQuery}
				)`;

				ctes.push({
					name: cteName,
					definition: cteDefinition,
				});

				processNode({
					node: childNode,
					parentTableName: childNode.tableName,
					path: [...path, fieldName],
				});
			} else {
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
