import { Lang, parse } from "@ast-grep/napi";
import { leadingIndentOfLine, lineStartOf } from "./fixtureEdit";

/** Identifiers spread into the `atmn({...})` object: `atmn({ ...shared })` → ["shared"]. */
export const rootSpreadNames = ({ source }: { source: string }): string[] => {
	const root = parse(Lang.TypeScript, source).root();
	const call = root.find("atmn($ARG)");
	const object = call?.getMatch("ARG");
	if (object === null || object === undefined || object.kind() !== "object")
		return [];
	return object
		.children()
		.filter((child) => child.kind() === "spread_element")
		.map((child) => child.namedChildren()[0]?.text() ?? child.text());
};

export const insertCollection = ({
	source,
	collection,
}: {
	source: string;
	collection: string;
}): string | null => {
	const root = parse(Lang.TypeScript, source).root();
	const call = root.find("atmn($ARG)");
	if (call === null) return null;
	const object = call.getMatch("ARG");
	if (object === null || object.kind() !== "object") return null;

	// A shorthand `plans` is a member as much as `plans: [...]`; counting only
	// pairs read `atmn({ features, plans })` as empty and replaced it wholesale.
	const members = object
		.children()
		.filter(
			(child) =>
				child.kind() === "pair" ||
				child.kind() === "shorthand_property_identifier",
		);
	const named = members.some((child) =>
		child.kind() === "pair"
			? child.namedChildren()[0]?.text() === collection
			: child.text() === collection,
	);
	if (named) return source;

	if (members.length === 0) {
		const callLineIndent = leadingIndentOfLine(
			source,
			call.range().start.index,
		);
		const indent = `${callLineIndent}\t`;
		return root.commitEdits([
			{
				startPos: object.range().start.index,
				endPos: object.range().end.index,
				insertedText: `{\n${indent}${collection}: [],\n${callLineIndent}}`,
			},
		]);
	}

	const last = members[members.length - 1];
	const lastEnd = last.range().end.index;
	const after = source.slice(lastEnd);
	const commaAfter = after.indexOf(",");
	const hasTrailingComma =
		commaAfter !== -1 && after.slice(0, commaAfter).trim() === "";
	const insertAt = hasTrailingComma ? lastEnd + commaAfter + 1 : lastEnd;
	const missingComma = hasTrailingComma ? "" : ",";
	// A one-line object keeps its shape: the key goes inline after the last pair.
	const spansLines = object.text().includes("\n");
	if (!spansLines) {
		return root.commitEdits([
			{
				startPos: insertAt,
				endPos: insertAt,
				insertedText: `${missingComma} ${collection}: [],`,
			},
		]);
	}
	const indent = source.slice(
		lineStartOf(source, last.range().start.index),
		last.range().start.index,
	);
	return root.commitEdits([
		{
			startPos: insertAt,
			endPos: insertAt,
			insertedText: `${missingComma}\n${indent}${collection}: [],`,
		},
	]);
};
