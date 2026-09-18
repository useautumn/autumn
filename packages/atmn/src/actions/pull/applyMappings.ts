import { COLLECTIONS, NESTED_FIXTURES } from "../../generated/emit";
import { resolveBranch } from "../../generated/emitRuntime";
import { mappingAssignments } from "../../generated/mappingAssignments";
import { patchFixturePaths } from "../../surgery/patchFixturePaths";
import { readFixtureValue } from "../../surgery/readFixtureValue";
import { locateFixture } from "./locateFixture";

export const applyMappings = ({
	catalog,
	configPath,
	files,
}: {
	catalog: Record<string, unknown>;
	configPath: string;
	files: Map<string, string>;
}): {
	replaced: string[];
	unlocated: { collection: string; id: string; action: string }[];
} => {
	const replaced: string[] = [];
	const unlocated: { collection: string; id: string; action: string }[] = [];
	const builders = Object.values(NESTED_FIXTURES).map(({ builder }) => builder);
	for (const [collection, collectionSpec] of Object.entries(COLLECTIONS)) {
		const rows = catalog[collection];
		if (!collectionSpec.pull || !Array.isArray(rows)) continue;
		for (const entry of rows) {
			const { spec, row } = resolveBranch({ spec: collectionSpec, row: entry });
			const id = row[spec.responseIdField];
			if (!spec.mappings || typeof id !== "string" || row.archived === true)
				continue;
			const key = spec.versioned ? `${id}@${row.versionSlug ?? "v1"}` : id;
			const located = locateFixture({
				configPath,
				files,
				builder: spec.builder,
				idField: spec.idField,
				id,
				internalId:
					typeof row.internalId === "string" ? row.internalId : undefined,
				where: spec.versioned
					? [
							{
								field: "versionSlug",
								equals:
									typeof row.versionSlug === "string" ? row.versionSlug : "v1",
								absentMeans: "v1",
							},
						]
					: undefined,
				allowDynamic: true,
				requireUnique: true,
			});
			if (!located) {
				unlocated.push({
					collection,
					id: key,
					action: "cannot locate the fixture to write processor mappings",
				});
				continue;
			}
			const planned = mappingAssignments({
				projection: spec.mappings,
				local: readFixtureValue({
					node: located.node,
					builders: [spec.builder, ...builders],
				}),
				remote: row,
			});
			if (planned.errors.length) {
				unlocated.push(
					...planned.errors.map((action) => ({ collection, id: key, action })),
				);
				continue;
			}
			if (!planned.assignments.length) continue;
			const patched = patchFixturePaths({
				source: located.source,
				builder: located.builder,
				idField: located.idField,
				id: located.id,
				where: located.where,
				builders,
				assignments: planned.assignments,
			});
			if (!patched || patched.skipped.length) {
				unlocated.push({
					collection,
					id: key,
					action:
						"cannot safely splice processor mappings into a computed or ambiguous value",
				});
				continue;
			}
			if (patched.source === located.source) continue;
			files.set(located.file, patched.source);
			replaced.push(key);
		}
	}
	return { replaced, unlocated };
};
