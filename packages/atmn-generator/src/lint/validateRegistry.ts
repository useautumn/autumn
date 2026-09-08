import type { JsonSchema } from "../casing/schemaKeyCasing";
import type { Overlay } from "../overlay/overlay";
import { fieldsAtPath } from "../spec/fieldsAtPath";
import type { RegistryEntry } from "./rules/registry";
import type { LintRule } from "./runtime/lintDocument";

/**
 * A rule keyed by a path that does not exist, or naming a field that does
 * not, is silently dead — the one failure mode of a path-keyed registry.
 * This turns it into a generate-time error listing every problem at once.
 */

const listOf = (paths: string | readonly string[]): string[] =>
	typeof paths === "string" ? [paths] : [...paths];

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
			return rule.alongside === undefined
				? listOf(rule.field)
				: [...listOf(rule.field), rule.alongside];
		case "linkedOnce":
			return [rule.groupBy, rule.namedBy, rule.collection];
		case "versionSlugs":
			return [
				rule.groupBy,
				rule.slug,
				...(rule.collection === undefined ? [] : [rule.collection]),
			];
		case "exists":
			return listOf(rule.field);
		case "compare":
			return [rule.field, rule.than];
		case "valueWhen":
			return [rule.when, rule.field];
		case "targetHas":
			return [rule.when, rule.field];
		case "targetLacks":
			return [rule.field];
	}
};

const describeRule = (rule: LintRule): string =>
	`${rule.kind} rule (${JSON.stringify({ ...rule, kind: undefined, because: undefined })})`;

export const validateRegistry = ({
	registry,
	schema,
	root,
	overlay,
}: {
	registry: Record<string, RegistryEntry>;
	schema: JsonSchema;
	root: JsonSchema;
	overlay: Overlay;
}): void => {
	const problems: string[] = [];
	const topLevel =
		fieldsAtPath({ schema, root, path: "", overlay }) ?? new Set();

	for (const [path, entry] of Object.entries(registry)) {
		const fields = fieldsAtPath({ schema, root, path, overlay });
		if (!fields) {
			problems.push(`"${path}" is not a path in the catalog.`);
			continue;
		}
		const unknownField = (field: string, where: string) =>
			`"${path}": ${where} names "${field}", which is not a field there. Fields: ${[...fields].sort().join(", ")}.`;

		/** A dotted field names a node under `path` — a union branch, say — so
		 * the leaf is checked against the node it actually lives on. */
		const namesField = (field: string): boolean => {
			const segments = field.split(".");
			const leaf = segments.pop() as string;
			if (segments.length === 0) return fields.has(leaf);
			const owner = fieldsAtPath({
				schema,
				root,
				// Only the registry key can be empty; an empty rule segment is a
				// typo, and joining it keeps `fieldsAtPath` rejecting the path.
				path: (path === "" ? segments : [path, ...segments]).join("."),
				overlay,
			});
			return owner?.has(leaf) ?? false;
		};

		if (entry.idField && !fields.has(entry.idField)) {
			problems.push(unknownField(entry.idField, "idField"));
		}

		for (const rule of entry.rules ?? []) {
			for (const field of fieldsNamedBy(rule)) {
				if (!namesField(field))
					problems.push(unknownField(field, describeRule(rule)));
			}
			if (rule.kind === "exists") {
				if (!topLevel.has(rule.in)) {
					problems.push(
						`"${path}": exists rule points at "${rule.in}", which is not a top-level collection.`,
					);
					continue;
				}
				const targetFields = fieldsAtPath({
					schema,
					root,
					path: rule.in,
					overlay,
				});
				for (const matching of listOf(rule.matching)) {
					const segments = matching.split(".");
					const leaf = segments.pop() as string;
					const owner =
						segments.length === 0
							? targetFields
							: fieldsAtPath({
									schema,
									root,
									path: [rule.in, ...segments].join("."),
									overlay,
								});
					if (!owner?.has(leaf)) {
						problems.push(
							`"${path}": exists rule matches on "${rule.in}.${matching}", which is not a field there.`,
						);
					}
				}
			}
			if (rule.kind === "linkedOnce") {
				const linkPath = `${path}.${rule.collection}`;
				const linkFields = fieldsAtPath({
					schema,
					root,
					path: linkPath,
					overlay,
				});
				if (!linkFields) {
					problems.push(
						`"${path}": linkedOnce rule links "${linkPath}", which is not a path in the catalog.`,
					);
					continue;
				}
				for (const field of [rule.identity, ...rule.pins]) {
					if (!linkFields.has(field))
						problems.push(
							`"${path}": linkedOnce rule names "${linkPath}.${field}", which is not a field there.`,
						);
				}
			}
			if (rule.kind === "versionSlugs" && rule.collection !== undefined) {
				const linkPath = `${path}.${rule.collection}`;
				const linkFields = fieldsAtPath({
					schema,
					root,
					path: linkPath,
					overlay,
				});
				for (const field of [
					rule.identity ?? "",
					...(rule.pins ?? [rule.slug]),
				]) {
					if (!linkFields?.has(field))
						problems.push(
							`"${path}": versionSlugs rule names "${linkPath}.${field}", which is not a field there.`,
						);
				}
			}
			if (rule.kind === "targetHas") {
				if (!topLevel.has(rule.in)) {
					problems.push(
						`"${path}": targetHas rule points at "${rule.in}", which is not a top-level collection.`,
					);
					continue;
				}
				const targetFields = fieldsAtPath({
					schema,
					root,
					path: rule.in,
					overlay,
				});
				if (!targetFields?.has(rule.matching)) {
					problems.push(
						`"${path}": targetHas rule matches on "${rule.in}.${rule.matching}", which is not a field there.`,
					);
				}
				if (!targetFields?.has(rule.target)) {
					problems.push(
						`"${path}": targetHas rule targets "${rule.in}.${rule.target}", which is not a field there.`,
					);
				}
			}
			if (rule.kind === "targetLacks") {
				if (!topLevel.has(rule.in)) {
					problems.push(
						`"${path}": targetLacks rule points at "${rule.in}", which is not a top-level collection.`,
					);
					continue;
				}
				const targetFields = fieldsAtPath({
					schema,
					root,
					path: rule.in,
					overlay,
				});
				if (!targetFields?.has(rule.matching)) {
					problems.push(
						`"${path}": targetLacks rule matches on "${rule.in}.${rule.matching}", which is not a field there.`,
					);
				}
				if (!targetFields?.has(rule.target)) {
					problems.push(
						`"${path}": targetLacks rule targets "${rule.in}.${rule.target}", which is not a field there.`,
					);
				}
				const parentPath = path.split(".").slice(0, -1).join(".");
				const parentFields = fieldsAtPath({
					schema,
					root,
					path: parentPath,
					overlay,
				});
				if (!parentFields?.has(rule.parentGuard)) {
					problems.push(
						`"${path}": targetLacks rule's parentGuard "${rule.parentGuard}" is not a field of "${parentPath || "config"}".`,
					);
				}
				if (!parentFields?.has(rule.parentIdField)) {
					problems.push(
						`"${path}": targetLacks rule's parentIdField "${rule.parentIdField}" is not a field of "${parentPath || "config"}".`,
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
