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

function getTableName(table: PgTable | any): string {
	return (table as any)[Symbol.for("drizzle:Name")] || String(table);
}

function extractRelationMetadata(relationObj: any): Record<string, any> {
	if (!relationObj || typeof relationObj.config !== "function") {
		return {};
	}

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

const relations = Object.entries(schemas).reduce(
	(acc, [key, value]) => {
		if (key.endsWith("Relations")) {
			const relationMetadata = extractRelationMetadata(value);
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

export class CTEBuilder {
	name: string;
	config: CTEConfig;
	dependencies: CTEBuilder[] = [];
	private sqlCache?: SQL;

	constructor(config: CTEConfig) {
		this.config = config;
		this.name = config.name || this.generateName();

		if (config.from instanceof CTEBuilder) {
			this.dependencies.push(config.from);
		}

		if (config.with) {
			for (const nestedCTE of Object.values(config.with)) {
				if (nestedCTE instanceof CTEBuilder) {
					this.dependencies.push(nestedCTE);
				} else if (nestedCTE.from instanceof CTEBuilder) {
					this.dependencies.push(nestedCTE.from);
				}
			}
		}
	}

	toSQL(): SQL {
		if (this.sqlCache) return this.sqlCache;

		const useJoinStrategy = shouldUseJoinStrategy({ config: this.config });

		if (useJoinStrategy) {
			const query = buildJoinGroupByQuery({
				config: this.config,
				relations,
				extractJoinCondition: this.extractJoinCondition.bind(this),
			});
			this.sqlCache = sql`${sql.identifier(this.name)} AS (${query})`;
			return this.sqlCache;
		}

		const fromTable = this.getSourceTable();
		const tableName = getTableName(fromTable);

		const selectFields: SQL[] = [sql`*`];

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

		let query = sql`SELECT ${sql.join(selectFields, sql`, `)} FROM ${sql.identifier(tableName)}`;

		if (this.config.where) {
			query = sql`${query} WHERE ${this.config.where}`;
		}

		if (this.config.orderBy && this.config.orderBy.length > 0) {
			query = sql`${query} ORDER BY ${sql.join(this.config.orderBy, sql`, `)}`;
		}

		if (this.config.limit !== undefined) {
			query = sql`${query} LIMIT ${sql.raw(String(this.config.limit))}`;
		}

		if (this.config.offset !== undefined) {
			query = sql`${query} OFFSET ${sql.raw(String(this.config.offset))}`;
		}

		this.sqlCache = sql`${sql.identifier(this.name)} AS (${query})`;
		return this.sqlCache;
	}

	private buildNestedField({
		fieldName,
		nestedConfig,
		parentTable,
	}: {
		fieldName: string;
		nestedConfig: CTEConfig | CTEBuilder;
		parentTable: PgTable;
	}): SQL {
		const config =
			nestedConfig instanceof CTEBuilder ? nestedConfig.config : nestedConfig;
		const mode = inferMode({
			fieldName,
			limit: config.limit,
			orderBy: config.orderBy,
			through: config.through,
			mode: config.mode,
		});

		const targetTable = this.getSourceTable(config.from);

		if (config.through) {
			return this.buildManyToManyField({
				nestedConfig: config,
				parentTable,
				targetTable,
				mode,
			});
		}

		let relationPath: RelationPath | undefined;
		let joinCondition: SQL | undefined;

		try {
			relationPath = findRelationPath({
				from: parentTable,
				to: targetTable,
				relations,
			});

			joinCondition = this.extractJoinCondition({
				parentTable,
				targetTable,
				fieldName,
			});
		} catch (error) {
			console.warn(
				`Warning: ${error instanceof Error ? error.message : String(error)}`,
			);
			joinCondition = config.where;
		}

		if (relationPath?.junction) {
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

		const parentRelations = relations[parentTableName];
		if (!parentRelations) {
			return undefined;
		}

		const relation = parentRelations[fieldName];
		if (!relation) {
			return undefined;
		}

		const fields = (relation as any).fields || [];
		const references = (relation as any).references || [];

		if (fields.length === 0 || references.length === 0) {
			const targetRelations = relations[targetTableName];
			if (!targetRelations) {
				return undefined;
			}

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

			const targetField = reverseFields[0];
			const parentReference = reverseReferences[0];

			return sql`${sql.identifier(targetTableName)}.${sql.identifier(targetField.name)} = ${sql.identifier(parentTableName)}.${sql.identifier(parentReference.name)}`;
		}

		const parentField = fields[0];
		const targetReference = references[0];

		return sql`${sql.identifier(targetTableName)}.${sql.identifier(targetReference.name)} = ${sql.identifier(parentTableName)}.${sql.identifier(parentField.name)}`;
	}

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

		const selectFields: SQL[] = [sql`${sql.identifier(targetTableName)}.*`];

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

		let innerSelect = sql`SELECT ${sql.join(selectFields, sql`, `)} FROM ${sql.identifier(targetTableName)}`;

		if (joinCondition) {
			innerSelect = sql`${innerSelect} WHERE ${joinCondition}`;

			if (nestedConfig.where) {
				innerSelect = sql`${innerSelect} AND ${nestedConfig.where}`;
			}
		} else if (nestedConfig.where) {
			innerSelect = sql`${innerSelect} WHERE ${nestedConfig.where}`;
		}

		if (nestedConfig.orderBy && nestedConfig.orderBy.length > 0) {
			innerSelect = sql`${innerSelect} ORDER BY ${sql.join(nestedConfig.orderBy, sql`, `)}`;
		}

		if (nestedConfig.limit !== undefined) {
			innerSelect = sql`${innerSelect} LIMIT ${sql.raw(String(nestedConfig.limit))}`;
		}

		const subquery = sql`SELECT json_agg(row_to_json(sub)) FROM (${innerSelect}) sub`;

		return sql`COALESCE((${subquery}), '[]'::json)`;
	}

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

		const selectFields: SQL[] = [sql`${sql.identifier(targetTableName)}.*`];

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

		let innerSelect = sql`SELECT ${sql.join(selectFields, sql`, `)} FROM ${sql.identifier(targetTableName)}`;

		if (joinCondition) {
			innerSelect = sql`${innerSelect} WHERE ${joinCondition}`;

			if (nestedConfig.where) {
				innerSelect = sql`${innerSelect} AND ${nestedConfig.where}`;
			}
		} else if (nestedConfig.where) {
			innerSelect = sql`${innerSelect} WHERE ${nestedConfig.where}`;
		}

		const subquery = sql`SELECT row_to_json(sub) FROM (${innerSelect}) sub`;

		return sql`(${subquery})`;
	}

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

		let subquery = sql`SELECT json_agg(row_to_json(${sql.identifier(targetTableName)})`;

		if (nestedConfig.orderBy && nestedConfig.orderBy.length > 0) {
			subquery = sql`${subquery} ORDER BY ${sql.join(nestedConfig.orderBy, sql`, `)}`;
		}

		subquery = sql`${subquery}) FROM ${sql.identifier(junctionTableName)}`;
		subquery = sql`${subquery} INNER JOIN ${sql.identifier(targetTableName)} ON ${through.to}`;
		subquery = sql`${subquery} WHERE ${through.from}`;

		if (nestedConfig.where) {
			subquery = sql`${subquery} AND ${nestedConfig.where}`;
		}

		if (nestedConfig.limit !== undefined) {
			subquery = sql`${subquery} LIMIT ${sql.raw(String(nestedConfig.limit))}`;
		}

		return sql`COALESCE((${subquery}), '[]'::json)`;
	}

	private getSourceTable(from?: PgTable | CTEBuilder): PgTable {
		const source = from || this.config.from;
		if (source instanceof CTEBuilder) {
			return this.getSourceTable(source.config.from);
		}
		return source;
	}

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

	async execute({
		db,
	}: CTEExecuteOptions): Promise<{ data: any[]; count: number }> {
		const allCTEs = this.collectDependencies();
		const cteDefinitions = allCTEs.map((cte) => cte.toSQL());

		const query = sql`WITH ${sql.join(cteDefinitions, sql`, `)} SELECT * FROM ${sql.identifier(this.name)}`;

		const result = await db.execute(query);
		const data = Array.isArray(result) ? result : result.rows || [];
		const count = result.count ?? data.length;

		return { data, count };
	}

	private generateName(): string {
		const table = this.getSourceTable();
		const tableName = getTableName(table);
		return `${tableName}_cte`;
	}
}

export function cte(config: CTEConfig): CTEBuilder {
	return new CTEBuilder(config);
}
