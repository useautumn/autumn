import type { SQL } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import type { CTEConfig } from "../buildCte.js";
import { CTEBuilder } from "../buildCte.js";
import { type CTEMode, inferMode } from "../typeDetection.js";

function getTableName(table: PgTable): string {
	return (table as any)[Symbol.for("drizzle:Name")] || String(table);
}

export interface RelationNode {
	table: PgTable;
	tableName: string;
	parentKey?: string;
	childKey?: string;
	mode: CTEMode;
	nestedFields: Record<string, RelationNode>;
	config: CTEConfig;
}

function parseJoinCondition({
	joinCondition,
	parentTableName,
	targetTableName,
}: {
	joinCondition?: SQL;
	parentTableName: string;
	targetTableName: string;
}): { parentKey: string; childKey: string } {
	if (!joinCondition) {
		return {
			parentKey: "id",
			childKey: `internal_${parentTableName.replace(/s$/, "")}_id`,
		};
	}

	try {
		// @ts-expect-error
		const sqlString = joinCondition.getSQL().sql;

		const match = sqlString.match(/(\w+)\.(\w+)\s*=\s*(\w+)\.(\w+)/);

		if (match) {
			const [_, table1, col1, _table2, col2] = match;

			if (table1 === targetTableName) {
				return { parentKey: col2, childKey: col1 };
			}
			return { parentKey: col1, childKey: col2 };
		}
	} catch (error) {
		console.warn("Failed to parse join condition:", error);
	}

	return {
		parentKey: "id",
		childKey: `internal_${parentTableName.replace(/s$/, "")}_id`,
	};
}

export function buildRelationGraph({
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
}): RelationNode {
	const table = getSourceTable(config.from);
	const tableName = getTableName(table);

	const node: RelationNode = {
		table,
		tableName,
		mode: "row",
		nestedFields: {},
		config,
	};

	if (!config.with) return node;

	for (const [fieldName, nestedConfig] of Object.entries(config.with)) {
		const nested =
			nestedConfig instanceof CTEBuilder ? nestedConfig.config : nestedConfig;
		const targetTable = getSourceTable(nested.from);
		const targetTableName = getTableName(targetTable);

		const joinCondition = extractJoinCondition({
			parentTable: table,
			targetTable,
			fieldName,
		});

		const { parentKey, childKey } = parseJoinCondition({
			joinCondition,
			parentTableName: tableName,
			targetTableName,
		});

		const nestedNode = buildRelationGraph({
			config: nested,
			relations,
			extractJoinCondition,
		});

		nestedNode.parentKey = parentKey;
		nestedNode.childKey = childKey;
		nestedNode.mode = inferMode({
			fieldName,
			limit: nested.limit,
			orderBy: nested.orderBy,
			through: nested.through,
			mode: nested.mode,
		});

		node.nestedFields[fieldName] = nestedNode;
	}

	return node;
}

function getSourceTable(from: PgTable | CTEBuilder): PgTable {
	if (from instanceof CTEBuilder) {
		return getSourceTable(from.config.from);
	}
	return from;
}
