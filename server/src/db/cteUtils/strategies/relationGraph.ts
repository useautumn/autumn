import type { SQL } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import type { CTEConfig } from "../buildCte.js";
import { CTEBuilder } from "../buildCte.js";
import { type CTEMode, inferMode } from "../typeDetection.js";

/**
 * Get table name from Drizzle table object
 */
function getTableName(table: PgTable): string {
	return (table as any)[Symbol.for("drizzle:Name")] || String(table);
}

/**
 * Represents a node in the relation graph
 */
export interface RelationNode {
	table: PgTable;
	tableName: string;
	parentKey?: string; // Foreign key column on child table
	childKey?: string; // Primary key column on parent table
	mode: CTEMode;
	nestedFields: Record<string, RelationNode>;
	config: CTEConfig; // Store original config for filters/ordering
}

/**
 * Parse join condition SQL to extract column names
 */
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
		// Default fallback - assume standard foreign key pattern
		return {
			parentKey: "id",
			childKey: `internal_${parentTableName.replace(/s$/, "")}_id`,
		};
	}

	// Extract column names from SQL
	// Expected format: "target_table.child_key = parent_table.parent_key"
	try {
		// @ts-expect-error
		const sqlString = joinCondition.getSQL().sql;

		// Try to parse pattern: table.column = table.column
		const match = sqlString.match(/(\w+)\.(\w+)\s*=\s*(\w+)\.(\w+)/);

		if (match) {
			const [_, table1, col1, _table2, col2] = match;

			// Determine which is parent and which is child
			if (table1 === targetTableName) {
				return { parentKey: col2, childKey: col1 };
			}
			return { parentKey: col1, childKey: col2 };
		}
	} catch (error) {
		// If parsing fails, use fallback
		console.warn("Failed to parse join condition:", error);
	}

	// Fallback
	return {
		parentKey: "id",
		childKey: `internal_${parentTableName.replace(/s$/, "")}_id`,
	};
}

/**
 * Build relation graph from CTE config
 * This maps out the entire relationship tree
 */
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

		// Extract join keys from relations
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

		// Recursively build nested nodes
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

/**
 * Get source table from config (unwrap CTEBuilder if needed)
 */
function getSourceTable(from: PgTable | CTEBuilder): PgTable {
	if (from instanceof CTEBuilder) {
		return getSourceTable(from.config.from);
	}
	return from;
}
