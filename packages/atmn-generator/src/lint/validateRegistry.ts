import type { JsonSchema } from "../casing/schemaKeyCasing";
import { fieldsAtPath } from "../spec/fieldsAtPath";
import type { RegistryEntry } from "./rules/registry";
import type { LintRule } from "./runtime/lintDocument";

/**
 * A rule keyed by a path that does not exist, or naming a field that does
 * not, is silently dead — the one failure mode of a path-keyed registry.
 * This turns it into a generate-time error listing every problem at once.
 */

const fieldsNamedBy = (rule: LintRule): string[] => {
	switch (rule.kind) {
		case "requiredWhen":
			return [rule.when, ...rule.require];
		case "forbiddenWhen":
			return [rule.when, ...rule.forbid];
		case "mutex":
		case "exactlyOne":
			return [...rule.fields];
		case "unique":
		case "exists":
			return [rule.field];
		case "compare":
			return [rule.field, rule.than];
	}
};

const describeRule = (rule: LintRule): string =>
	`${rule.kind} rule (${JSON.stringify({ ...rule, kind: undefined, because: undefined })})`;

export const validateRegistry = ({
	registry,
	schema,
	root,
}: {
	registry: Record<string, RegistryEntry>;
	schema: JsonSchema;
	root: JsonSchema;
}): void => {
	const problems: string[] = [];
	const topLevel = fieldsAtPath({ schema, root, path: "" }) ?? new Set();

	for (const [path, entry] of Object.entries(registry)) {
		const fields = fieldsAtPath({ schema, root, path });
		if (!fields) {
			problems.push(`"${path}" is not a path in the catalog.`);
			continue;
		}
		const unknownField = (field: string, where: string) =>
			`"${path}": ${where} names "${field}", which is not a field there. Fields: ${[...fields].sort().join(", ")}.`;

		if (entry.idField && !fields.has(entry.idField)) {
			problems.push(unknownField(entry.idField, "idField"));
		}

		for (const rule of entry.rules ?? []) {
			for (const field of fieldsNamedBy(rule)) {
				if (!fields.has(field))
					problems.push(unknownField(field, describeRule(rule)));
			}
			if (rule.kind === "exists") {
				if (!topLevel.has(rule.in)) {
					problems.push(
						`"${path}": exists rule points at "${rule.in}", which is not a top-level collection.`,
					);
					continue;
				}
				const targetFields = fieldsAtPath({ schema, root, path: rule.in });
				if (!targetFields?.has(rule.matching)) {
					problems.push(
						`"${path}": exists rule matches on "${rule.in}.${rule.matching}", which is not a field there.`,
					);
				}
			}
		}
	}

	if (problems.length > 0) {
		throw new Error(
			`lint registry has ${problems.length} dead reference${problems.length === 1 ? "" : "s"}:\n${problems.map((p) => `  - ${p}`).join("\n")}`,
		);
	}
};
