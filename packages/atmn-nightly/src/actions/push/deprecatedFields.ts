import { COLLECTIONS } from "../../generated/emit";

export type DeprecatedUse = {
	collection: string;
	id: string;
	path: string;
	reason: string;
};

const holdsPath = (value: unknown, segments: string[]): boolean => {
	if (segments.length === 0) return value !== undefined && value !== null;
	if (Array.isArray(value))
		return value.some((entry) => holdsPath(entry, segments));
	if (value === null || typeof value !== "object") return false;
	const [head, ...rest] = segments;
	return holdsPath((value as Record<string, unknown>)[head], rest);
};

/** Every deprecated field a wire document still states, so push can say so
 * before the preview: the field keeps working, and nobody new should copy it. */
export const deprecatedUsesIn = ({
	wire,
}: {
	wire: Record<string, unknown>;
}): DeprecatedUse[] =>
	Object.entries(COLLECTIONS).flatMap(([collection, spec]) => {
		const rows = wire[collection];
		if (!Array.isArray(rows)) return [];
		const idKey = spec.idField.replace(
			/[A-Z]/g,
			(letter) => `_${letter.toLowerCase()}`,
		);
		return (spec.deprecated ?? []).flatMap(({ path, reason }) =>
			rows.flatMap((row) => {
				if (row === null || typeof row !== "object") return [];
				if (!holdsPath(row, path.split("."))) return [];
				const id = (row as Record<string, unknown>)[idKey];
				return [
					{ collection, id: typeof id === "string" ? id : "?", path, reason },
				];
			}),
		);
	});

export const renderDeprecatedUses = ({
	uses,
}: {
	uses: DeprecatedUse[];
}): string =>
	uses
		.map(
			(use) =>
				`note: ${use.collection} "${use.id}" states deprecated \`${use.path}\`. ${use.reason}`,
		)
		.join("\n");
