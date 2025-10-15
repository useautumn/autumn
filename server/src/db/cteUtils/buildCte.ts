import { schemas } from "@autumn/shared";
import { type SQL, sql } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import {
	findRelationPath,
	getJunctionFields,
	type RelationPath,
} from "./relationUtils.js";
import { buildJoinGroupByQuery } from "./strategies/joinGroupByStrategy.js";
import { shouldUseJoinStrategy } from "./strategies/strategySelector.js";
import { type CTEMode, inferMode } from "./typeDetection.js";

/**
 * Extract table name from Drizzle table object
 */
function getTableName(table: PgTable | any): string {
	return (table as any)[Symbol.for("drizzle:Name")] || String(table);
}

/**
 * Helper to extract relation metadata by calling the config function
 * with mock helpers that capture the relation definitions
 */
function extractRelationMetadata(relationObj: any): Record<string, any> {
	if (!relationObj || typeof relationObj.config !== "function") {
		return {};
	}

	// Mock helpers that capture relation metadata
	const mockHelpers = {
		one: (table: any, config?: any) => {
			const relation = {
				relationName: "",
				referencedTable: () => table,
				referencedTableName:
					(table as any)[Symbol.for("drizzle:Name")] || table,
				isOne: true,
				fieldName: "",
				fields: config?.fields || [],
				references: config?.references || [],
				table,
				withFieldName: (name: string) => {
					relation.fieldName = name;
					relation.relationName = name;
					return relation;
				},
			};
			return relation;
		},
		many: (table: any) => {
			const relation = {
				relationName: "",
				referencedTable: () => table,
				referencedTableName:
					(table as any)[Symbol.for("drizzle:Name")] || table,
				isMany: true,
				fieldName: "",
				table,
				withFieldName: (name: string) => {
					relation.fieldName = name;
					relation.relationName = name;
					return relation;
				},
			};
			return relation;
		},
	};

	try {
		const result = relationObj.config(mockHelpers);
		return result || {};
	} catch (error) {
		console.warn(
			`Failed to extract relation metadata:`,
			error instanceof Error ? error.message : error,
		);
		return {};
	}
}

// Extract relations from schema, indexed by actual table name
const relations = Object.entries(schemas).reduce(
	(acc, [key, value]) => {
		if (key.endsWith("Relations")) {
			const relationMetadata = extractRelationMetadata(value);
			// Index by the actual table name, not the key name
			const table = (value as any).table;
			if (table) {
				const tableName = getTableName(table);
				acc[tableName] = relationMetadata;
			}
		}
		return acc;
	},
	{} as Record<string, any>,
);

export interface ThroughConfig {
	table: PgTable;
	from: SQL;
	to: SQL;
}

export interface CTEConfig {
	name?: string;
	from: PgTable | CTEBuilder;
	with?: Record<string, CTEConfig | CTEBuilder>;
	where?: SQL;
	orderBy?: SQL[];
	limit?: number;
	offset?: number;
	mode?: CTEMode;
	through?: ThroughConfig;
	filter?: SQL;
	distinct?: boolean;
	strategy?: "correlated" | "join_group_by" | "auto";
}

export interface CTEExecuteOptions {
	db: any;
}

/**
 * Main CTE builder class
 * Handles recursive CTE composition, dependency tracking, and SQL generation
 */
export class CTEBuilder {
	name: string;
	config: CTEConfig;
	dependencies: CTEBuilder[] = [];
	private sqlCache?: SQL;

	constructor(config: CTEConfig) {
		this.config = config;
		this.name = config.name || this.generateName();

		// Track dependencies if 'from' is another CTE
		if (config.from instanceof CTEBuilder) {
			this.dependencies.push(config.from);
		}

		// Track dependencies in nested 'with' CTEs
		if (config.with) {
			for (const nestedCTE of Object.values(config.with)) {
				// If the nested value is a CTEBuilder, add it as a dependency
				if (nestedCTE instanceof CTEBuilder) {
					this.dependencies.push(nestedCTE);
				} else if (nestedCTE.from instanceof CTEBuilder) {
					this.dependencies.push(nestedCTE.from);
				}
			}
		}
	}

	/**
	 * Generate CTE definition SQL
	 */
	toSQL(): SQL {
		if (this.sqlCache) return this.sqlCache;

		// Check if we should use the optimized JOIN strategy
		const useJoinStrategy = shouldUseJoinStrategy({ config: this.config });

		if (useJoinStrategy) {
			// Use optimized JOIN + GROUP BY strategy
			const query = buildJoinGroupByQuery({
				config: this.config,
				relations,
				extractJoinCondition: this.extractJoinCondition.bind(this),
			});
			this.sqlCache = sql`${sql.identifier(this.name)} AS (${query})`;
			return this.sqlCache;
		}

		// Fall back to correlated subquery strategy
		const fromTable = this.getSourceTable();
		const tableName = getTableName(fromTable);

		// Build SELECT clause
		// Note: We select all columns without alias to avoid table reference issues in WHERE clauses
		const selectFields: SQL[] = [sql`*`];

		// Add nested fields from 'with'
		if (this.config.with) {
			for (const [fieldName, nestedConfig] of Object.entries(
				this.config.with,
			)) {
				const nestedSQL = this.buildNestedField({
					fieldName,
					nestedConfig,
					parentTable: fromTable,
				});
				selectFields.push(sql`${nestedSQL} AS ${sql.identifier(fieldName)}`);
			}
		}

		// Build the query
		let query = sql`SELECT ${sql.join(selectFields, sql`, `)} FROM ${sql.identifier(tableName)}`;

		// Add WHERE clause
		if (this.config.where) {
			query = sql`${query} WHERE ${this.config.where}`;
		}

		// Add ORDER BY clause
		if (this.config.orderBy && this.config.orderBy.length > 0) {
			query = sql`${query} ORDER BY ${sql.join(this.config.orderBy, sql`, `)}`;
		}

		// Add LIMIT clause
		if (this.config.limit !== undefined) {
			query = sql`${query} LIMIT ${sql.raw(String(this.config.limit))}`;
		}

		// Add OFFSET clause
		if (this.config.offset !== undefined) {
			query = sql`${query} OFFSET ${sql.raw(String(this.config.offset))}`;
		}

		// Wrap in CTE definition
		this.sqlCache = sql`${sql.identifier(this.name)} AS (${query})`;
		return this.sqlCache;
	}

	/**
	 * Build SQL for a nested field in 'with' clause
	 */
	private buildNestedField({
		fieldName,
		nestedConfig,
		parentTable,
	}: {
		fieldName: string;
		nestedConfig: CTEConfig | CTEBuilder;
		parentTable: PgTable;
	}): SQL {
		// If nestedConfig is already a CTEBuilder, extract its config
		const config =
			nestedConfig instanceof CTEBuilder ? nestedConfig.config : nestedConfig;
		// Determine if this should be array or row
		const mode = inferMode({
			fieldName,
			limit: config.limit,
			orderBy: config.orderBy,
			through: config.through,
			mode: config.mode,
		});

		const targetTable = this.getSourceTable(config.from);

		// Handle many-to-many through junction table
		if (config.through) {
			return this.buildManyToManyField({
				nestedConfig: config,
				parentTable,
				targetTable,
				mode,
			});
		}

		// Try to find relation path using schema relations
		let relationPath: RelationPath | undefined;
		let joinCondition: SQL | undefined;

		try {
			relationPath = findRelationPath({
				from: parentTable,
				to: targetTable,
				relations,
			});

			// Extract join condition from relation
			joinCondition = this.extractJoinCondition({
				parentTable,
				targetTable,
				fieldName,
			});
		} catch (error) {
			// If no relation found, use the WHERE clause as-is
			console.warn(
				`Warning: ${error instanceof Error ? error.message : String(error)}`,
			);
			joinCondition = config.where;
		}

		// Use relation path if found, otherwise use explicit config
		if (relationPath?.junction) {
			// Many-to-many detected
			const junctionFields = getJunctionFields({
				junction: relationPath.junction,
				from: parentTable,
				to: targetTable,
				relations,
			});

			return this.buildManyToManyField({
				nestedConfig: config,
				parentTable,
				targetTable,
				mode,
				junctionConfig: junctionFields,
			});
		}

		// Direct relationship (one-to-one or one-to-many)
		if (mode === "array") {
			return this.buildArrayField({
				nestedConfig: config,
				parentTable,
				targetTable,
				joinCondition,
			});
		}

		return this.buildRowField({
			nestedConfig: config,
			parentTable,
			targetTable,
			joinCondition,
		});
	}

	/**
	 * Extract join condition from Drizzle relations
	 */
	private extractJoinCondition({
		parentTable,
		targetTable,
		fieldName,
	}: {
		parentTable: PgTable;
		targetTable: PgTable;
		fieldName: string;
	}): SQL | undefined {
		const parentTableName = getTableName(parentTable);
		const targetTableName = getTableName(targetTable);

		// Look up relations for parent table
		const parentRelations = relations[parentTableName];
		if (!parentRelations) {
			return undefined;
		}

		// Find the specific relation by field name
		const relation = parentRelations[fieldName];
		if (!relation) {
			return undefined;
		}

		// Extract field mappings from relation
		const fields = (relation as any).fields || [];
		const references = (relation as any).references || [];

		if (fields.length === 0 || references.length === 0) {
			// Check reverse relation (from target to parent)
			const targetRelations = relations[targetTableName];
			if (!targetRelations) {
				return undefined;
			}

			// Look for a relation back to the parent
			const reverseRelation = Object.values(targetRelations).find((rel) => {
				let relTable = (rel as any).referencedTable || (rel as any).table;
				if (typeof relTable === "function") {
					relTable = relTable();
				}
				const relTableName = getTableName(relTable);
				return relTableName === parentTableName;
			});

			if (!reverseRelation) {
				return undefined;
			}

			const reverseFields = (reverseRelation as any).fields || [];
			const reverseReferences = (reverseRelation as any).references || [];

			if (reverseFields.length === 0 || reverseReferences.length === 0)
				return undefined;

			// Build condition: targetTable.field = parentTable.reference
			const targetField = reverseFields[0];
			const parentReference = reverseReferences[0];

			return sql`${sql.identifier(targetTableName)}.${sql.identifier(targetField.name)} = ${sql.identifier(parentTableName)}.${sql.identifier(parentReference.name)}`;
		}

		// Build condition: targetTable.reference = parentTable.field
		const parentField = fields[0];
		const targetReference = references[0];

		return sql`${sql.identifier(targetTableName)}.${sql.identifier(targetReference.name)} = ${sql.identifier(parentTableName)}.${sql.identifier(parentField.name)}`;
	}

	/**
	 * Build array field SQL (one-to-many)
	 */
	private buildArrayField({
		nestedConfig,
		targetTable,
		joinCondition,
	}: {
		nestedConfig: CTEConfig;
		parentTable: PgTable;
		targetTable: PgTable;
		joinCondition?: SQL;
	}): SQL {
		const targetTableName = getTableName(targetTable);

		// Build SELECT fields - start with all columns
		const selectFields: SQL[] = [sql`${sql.identifier(targetTableName)}.*`];

		// Add nested WITH fields if they exist
		if (nestedConfig.with) {
			for (const [fieldName, nestedFieldConfig] of Object.entries(
				nestedConfig.with,
			)) {
				const nestedSQL = this.buildNestedField({
					fieldName,
					nestedConfig: nestedFieldConfig,
					parentTable: targetTable,
				});
				selectFields.push(sql`${nestedSQL} AS ${sql.identifier(fieldName)}`);
			}
		}

		// Build the inner SELECT
		let innerSelect = sql`SELECT ${sql.join(selectFields, sql`, `)} FROM ${sql.identifier(targetTableName)}`;

		// Add WHERE clause (join condition + additional filters)
		if (joinCondition) {
			innerSelect = sql`${innerSelect} WHERE ${joinCondition}`;

			// Add additional filters
			if (nestedConfig.where) {
				innerSelect = sql`${innerSelect} AND ${nestedConfig.where}`;
			}
		} else if (nestedConfig.where) {
			innerSelect = sql`${innerSelect} WHERE ${nestedConfig.where}`;
		}

		// Add ORDER BY
		if (nestedConfig.orderBy && nestedConfig.orderBy.length > 0) {
			innerSelect = sql`${innerSelect} ORDER BY ${sql.join(nestedConfig.orderBy, sql`, `)}`;
		}

		// Add LIMIT
		if (nestedConfig.limit !== undefined) {
			innerSelect = sql`${innerSelect} LIMIT ${sql.raw(String(nestedConfig.limit))}`;
		}

		// Wrap in json_agg with subquery alias
		const subquery = sql`SELECT json_agg(row_to_json(sub)) FROM (${innerSelect}) sub`;

		// Wrap with COALESCE
		return sql`COALESCE((${subquery}), '[]'::json)`;
	}

	/**
	 * Build row field SQL (one-to-one)
	 */
	private buildRowField({
		nestedConfig,
		targetTable,
		joinCondition,
	}: {
		nestedConfig: CTEConfig;
		parentTable: PgTable;
		targetTable: PgTable;
		joinCondition?: SQL;
	}): SQL {
		const targetTableName = getTableName(targetTable);

		// Build SELECT fields - start with all columns
		const selectFields: SQL[] = [sql`${sql.identifier(targetTableName)}.*`];

		// Add nested WITH fields if they exist
		if (nestedConfig.with) {
			for (const [fieldName, nestedFieldConfig] of Object.entries(
				nestedConfig.with,
			)) {
				const nestedSQL = this.buildNestedField({
					fieldName,
					nestedConfig: nestedFieldConfig,
					parentTable: targetTable,
				});
				selectFields.push(sql`${nestedSQL} AS ${sql.identifier(fieldName)}`);
			}
		}

		// Build the inner SELECT
		let innerSelect = sql`SELECT ${sql.join(selectFields, sql`, `)} FROM ${sql.identifier(targetTableName)}`;

		// Add WHERE clause (join condition + additional filters)
		if (joinCondition) {
			innerSelect = sql`${innerSelect} WHERE ${joinCondition}`;

			// Add additional filters
			if (nestedConfig.where) {
				innerSelect = sql`${innerSelect} AND ${nestedConfig.where}`;
			}
		} else if (nestedConfig.where) {
			innerSelect = sql`${innerSelect} WHERE ${nestedConfig.where}`;
		}

		// Wrap in row_to_json with subquery
		const subquery = sql`SELECT row_to_json(sub) FROM (${innerSelect}) sub`;

		return sql`(${subquery})`;
	}

	/**
	 * Build many-to-many field SQL (through junction table)
	 */
	private buildManyToManyField({
		nestedConfig,
		targetTable,
		junctionConfig,
	}: {
		nestedConfig: CTEConfig;
		parentTable: PgTable;
		targetTable: PgTable;
		mode: CTEMode;
		junctionConfig?: {
			table: PgTable;
			fromField: string;
			toField: string;
		};
	}): SQL {
		const through = nestedConfig.through!;
		const junctionTable = junctionConfig?.table || through.table;
		const junctionTableName = getTableName(junctionTable);
		const targetTableName = getTableName(targetTable);

		// Note: We don't use aliases in subqueries to avoid table reference issues in WHERE clauses
		let subquery = sql`SELECT json_agg(row_to_json(${sql.identifier(targetTableName)})`;

		// Add ORDER BY
		if (nestedConfig.orderBy && nestedConfig.orderBy.length > 0) {
			subquery = sql`${subquery} ORDER BY ${sql.join(nestedConfig.orderBy, sql`, `)}`;
		}

		subquery = sql`${subquery}) FROM ${sql.identifier(junctionTableName)}`;
		subquery = sql`${subquery} INNER JOIN ${sql.identifier(targetTableName)} ON ${through.to}`;
		subquery = sql`${subquery} WHERE ${through.from}`;

		// Add additional WHERE filters
		if (nestedConfig.where) {
			subquery = sql`${subquery} AND ${nestedConfig.where}`;
		}

		// Add LIMIT
		if (nestedConfig.limit !== undefined) {
			subquery = sql`${subquery} LIMIT ${sql.raw(String(nestedConfig.limit))}`;
		}

		// Wrap with COALESCE
		return sql`COALESCE((${subquery}), '[]'::json)`;
	}

	/**
	 * Get the source table (unwrap if it's a CTE)
	 */
	private getSourceTable(from?: PgTable | CTEBuilder): PgTable {
		const source = from || this.config.from;
		if (source instanceof CTEBuilder) {
			return this.getSourceTable(source.config.from);
		}
		return source;
	}

	/**
	 * Collect all CTE dependencies in correct order
	 */
	collectDependencies(): CTEBuilder[] {
		const deps = new Set<CTEBuilder>();
		const visited = new Set<CTEBuilder>();

		const visit = (cte: CTEBuilder) => {
			if (visited.has(cte)) return;
			visited.add(cte);

			for (const dep of cte.dependencies) {
				visit(dep);
			}

			deps.add(cte);
		};

		visit(this);
		return Array.from(deps);
	}

	/**
	 * Execute the CTE query and return data with count
	 */
	async execute({
		db,
	}: CTEExecuteOptions): Promise<{ data: any[]; count: number }> {
		const allCTEs = this.collectDependencies();
		const cteDefinitions = allCTEs.map((cte) => cte.toSQL());

		const query = sql`WITH ${sql.join(cteDefinitions, sql`, `)} SELECT * FROM ${sql.identifier(this.name)}`;

		// Execute and extract rows and count - let errors propagate
		const result = await db.execute(query);
		const data = Array.isArray(result) ? result : result.rows || [];
		const count = result.count ?? data.length;

		return { data, count };
	}

	/**
	 * Generate a unique name for this CTE
	 */
	private generateName(): string {
		const table = this.getSourceTable();
		const tableName = getTableName(table);
		return `${tableName}_cte`;
	}
}

/**
 * Main CTE builder function
 * Usage:
 * ```typescript
 * const usersCTE = cte({
 *   from: userTable,
 *   with: {
 *     organizations: cte({ from: organizations, ... })
 *   }
 * });
 * ```
 */
export function cte(config: CTEConfig): CTEBuilder {
	return new CTEBuilder(config);
}
