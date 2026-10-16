import type { UpdateCatalogParamsInput } from "@autumn/shared";

type ParsedCatalogImport =
	| { params: UpdateCatalogParamsInput }
	| { error: string }
	| { empty: true };

/** Removal arrays and deletion flags are dropped: an import only creates and updates. */
export const parseCatalogImportJson = ({
	text,
}: {
	text: string;
}): ParsedCatalogImport => {
	if (text.trim() === "") return { empty: true };
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch {
		return { error: "Invalid JSON" };
	}
	if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed))
		return { error: "Expected a JSON object from Export catalog" };
	const {
		skip_deletions: _skipDeletions,
		skip_version_deletions: _skipVersionDeletions,
		remove_plans: _removePlans,
		remove_features: _removeFeatures,
		...params
	} = parsed as UpdateCatalogParamsInput;
	return { params };
};
