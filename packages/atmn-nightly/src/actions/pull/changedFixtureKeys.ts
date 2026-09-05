import type { CollectionSpec } from "../../generated/emitRuntime";
import type { PreviewEntry } from "./applyPreview";

const camelOf = (snake: string): string =>
	snake.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());

const isObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

const NOOP_ACTIONS = new Set(["none", "skip"]);

/** A nested lane (licenses, variants) is work when any row in it acts. */
const laneHasWork = (value: unknown): boolean =>
	Array.isArray(value) &&
	value.some((row) =>
		Object.entries(row as Record<string, unknown>).some(
			([key, entry]) =>
				key.endsWith("ction") &&
				typeof entry === "string" &&
				!NOOP_ACTIONS.has(entry),
		),
	);

/**
 * The top-level fixture keys a preview update touches, in patch order:
 * content first, then version slug, then the id, so each lookup still finds
 * the fixture by what the config said before. Null when the preview does not
 * name its fields, which means the whole fixture is rewritten instead.
 */
export const changedFixtureKeys = ({
	spec,
	entry,
	includeMappings,
	fixtureId,
	rowId,
}: {
	spec: CollectionSpec;
	entry: PreviewEntry;
	includeMappings: boolean;
	/** The public id the located fixture states; null when not a literal string. */
	fixtureId: string | null;
	/** The id the server row carries now. */
	rowId: unknown;
}): string[] | null => {
	const keys = new Set<string>();
	const known = new Set(spec.keys);
	const addAttribute = (attribute: string): boolean => {
		const key = camelOf(attribute);
		if (key === "id" || key === spec.idField || key === "internalId")
			return true;
		// Mappings ride include_mappings, never a diff.
		if (key === "processors" && !includeMappings) return true;
		if (!known.has(key)) return false;
		keys.add(key);
		return true;
	};

	const planChange = entry.planChange;
	if (isObject(planChange)) {
		const previous = planChange.previousAttributes;
		if (isObject(previous)) {
			for (const attribute of Object.keys(previous)) {
				if (!addAttribute(attribute)) return null;
			}
		}
		if (planChange.priceChange !== undefined) keys.add("price");
		if (planChange.freeTrialChange !== undefined) keys.add("freeTrial");
		if (Array.isArray(planChange.itemChanges) && planChange.itemChanges.length)
			keys.add("items");
		if (planChange.customize !== undefined) return null;
	}
	if (isObject(entry.previousAttributes)) {
		for (const attribute of Object.keys(entry.previousAttributes)) {
			if (!addAttribute(attribute)) return null;
		}
	}
	if (laneHasWork(entry.licenses) && known.has("licenses"))
		keys.add("licenses");
	if (laneHasWork(entry.variants) && known.has("variants"))
		keys.add("variants");

	const ordered = [...keys].filter((key) => key !== "versionSlug");
	if (entry.newVersionSlug !== undefined || keys.has("versionSlug"))
		ordered.push("versionSlug");
	if (typeof rowId === "string" && fixtureId !== null && rowId !== fixtureId)
		ordered.push(spec.idField);
	return ordered.length === 0 ? null : ordered;
};
