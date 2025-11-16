import type { Relations } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";

export interface RelationPath {
	type: "row" | "array";
	path: PgTable[];
	junction?: PgTable;
}

export interface JunctionConfig {
	table: PgTable;
	fromField: string;
	toField: string;
}

/**
 * Find the relationship path between two tables using Drizzle relations
 * Supports:
 * - Direct one() relationships → row
 * - Direct many() relationships → array
 * - Many-to-many through junction table → array
 */
export function findRelationPath({
	from,
	to,
	relations,
}: {
	from: PgTable;
	to: PgTable;
	relations: Record<string, Relations>;
}): RelationPath {
	const fromTableName = (from as any)[Symbol.for("drizzle:Name")] || from;
	const toTableName = (to as any)[Symbol.for("drizzle:Name")] || to;

	// 1. Check for direct relationship
	const fromRelations = relations[fromTableName];
	if (fromRelations) {
		const directRel = Object.entries(fromRelations).find(([_, rel]) => {
			let relTable = (rel as any).referencedTable || (rel as any).table;
			// If it's a function, call it to get the actual table
			if (typeof relTable === "function") {
				relTable = relTable();
			}
			const relTableName = relTable?.[Symbol.for("drizzle:Name")] || relTable;
			return relTableName === toTableName;
		});

		if (directRel) {
			const [_, rel] = directRel;
			// Check if it's a one() or many() relationship
			const isOne = (rel as any).isOne !== undefined;
			const isMany = (rel as any).isMany !== undefined;

			if (isOne) {
				return { type: "row", path: [from, to] };
			}
			if (isMany) {
				return { type: "array", path: [from, to] };
			}
		}
	}

	// 2. Check for many-to-many (through junction table)
	const junctionPaths = findJunctionPaths({ from, to, relations });

	if (junctionPaths.length === 1) {
		const path = junctionPaths[0];
		return {
			type: "array",
			path: path.path,
			junction: path.junction,
		};
	}

	if (junctionPaths.length > 1) {
		const pathStrings = junctionPaths
			.map((p) => p.path.map((t) => getTableName(t)).join(" → "))
			.join(", ");
		throw new Error(
			`Ambiguous relationship between ${getTableName(from)} and ${getTableName(to)}. Found multiple paths: [${pathStrings}]. Please specify 'through' explicitly.`,
		);
	}

	// 3. No path found
	throw new Error(
		`No relationship found between ${getTableName(from)} and ${getTableName(to)}. Please define the relationship in Drizzle relations or specify 'through' explicitly.`,
	);
}

/**
 * Find many-to-many paths: from -> junction (many from 'from', one from junction) -> to (one from junction)
 */
function findJunctionPaths({
	from,
	to,
	relations,
}: {
	from: PgTable;
	to: PgTable;
	relations: Record<string, Relations>;
}): Array<{ path: [PgTable, PgTable, PgTable]; junction: PgTable }> {
	const paths: Array<{
		path: [PgTable, PgTable, PgTable];
		junction: PgTable;
	}> = [];
	const fromTableName = getTableName(from);
	const toTableName = getTableName(to);

	// Get all many() relationships from 'from' table
	const fromRelations = relations[fromTableName];
	if (!fromRelations) return paths;

	for (const [_, rel] of Object.entries(fromRelations)) {
		const isMany = (rel as any).isMany !== undefined;
		if (!isMany) continue;

		const junctionTable = (rel as any).referencedTable || (rel as any).table;
		const junctionTableName = getTableName(junctionTable);

		// Check if junction table has a one() relationship to 'to' table
		const junctionRelations = relations[junctionTableName];
		if (!junctionRelations) continue;

		// Look for a one() relationship from junction to 'to'
		const toRel = Object.entries(junctionRelations).find(([_, jRel]) => {
			const isOne = (jRel as any).isOne !== undefined;
			if (!isOne) return false;

			const targetTable = (jRel as any).referencedTable || (jRel as any).table;
			const targetTableName = getTableName(targetTable);
			return targetTableName === toTableName;
		});

		if (toRel) {
			// Also verify there's a one() relationship from junction back to 'from'
			const reverseRel = Object.entries(junctionRelations).find(([_, jRel]) => {
				const isOne = (jRel as any).isOne !== undefined;
				if (!isOne) return false;

				const targetTable =
					(jRel as any).referencedTable || (jRel as any).table;
				const targetTableName = getTableName(targetTable);
				return targetTableName === fromTableName;
			});

			if (reverseRel) {
				paths.push({
					path: [from, junctionTable, to],
					junction: junctionTable,
				});
			}
		}
	}

	return paths;
}

/**
 * Extract table name from Drizzle table object
 */
function getTableName(table: PgTable): string {
	return (table as any)[Symbol.for("drizzle:Name")] || String(table);
}

/**
 * Extract join field information from a junction table relationship
 */
export function getJunctionFields({
	junction,
	from,
	to,
	relations,
}: {
	junction: PgTable;
	from: PgTable;
	to: PgTable;
	relations: Record<string, Relations>;
}): JunctionConfig {
	const junctionTableName = getTableName(junction);
	const fromTableName = getTableName(from);
	const toTableName = getTableName(to);

	const junctionRelations = relations[junctionTableName];
	if (!junctionRelations) {
		throw new Error(
			`No relations defined for junction table ${junctionTableName}`,
		);
	}

	let fromField = "";
	let toField = "";

	for (const [_, rel] of Object.entries(junctionRelations)) {
		const isOne = (rel as any).isOne !== undefined;
		if (!isOne) continue;

		const targetTable = (rel as any).referencedTable || (rel as any).table;
		const targetTableName = getTableName(targetTable);
		const fields = (rel as any).fields || [];

		if (targetTableName === fromTableName && fields.length > 0) {
			fromField = fields[0].name;
		}

		if (targetTableName === toTableName && fields.length > 0) {
			toField = fields[0].name;
		}
	}

	if (!fromField || !toField) {
		throw new Error(
			`Could not determine junction fields for ${junctionTableName} between ${fromTableName} and ${toTableName}`,
		);
	}

	return { table: junction, fromField, toField };
}
