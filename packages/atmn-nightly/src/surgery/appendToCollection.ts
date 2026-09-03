import type { SgNode } from "@ast-grep/napi";
import { Lang, parse } from "@ast-grep/napi";
import { leadingIndentOfLine, lineStartOf } from "./fixtureEdit";

export const appendToCollection = ({
	source,
	collection,
	text,
}: {
	source: string;
	collection: string;
	text: string;
}): string | null => {
	const root = parse(Lang.TypeScript, source).root();
	// A bare `collection: [$$$]` parses as a type annotation, so the anchor must
	// be the enclosing atmn call; the leading/trailing $$$ allow sibling keys.
	const anchor =
		root.find(`atmn({ $$$, ${collection}: [$$$ITEMS], $$$ })`) ??
		root.find(`atmn({ ${collection}: [$$$ITEMS] })`);
	if (anchor === null) return null;
	const array = collectionArray({ anchor, collection });
	if (array === null) return null;
	const elements = array.namedChildren();
	if (elements.length === 0) {
		const indent = leadingIndentOfLine(source, array.range().start.index);
		return root.commitEdits([
			{
				startPos: array.range().start.index,
				endPos: array.range().end.index,
				insertedText: `[\n${indent}\t${text},\n${indent}]`,
			},
		]);
	}
	const last = elements[elements.length - 1];
	const lastEnd = last.range().end.index;
	const after = source.slice(lastEnd);
	const commaAfter = after.indexOf(",");
	const hasTrailingComma =
		commaAfter !== -1 && after.slice(0, commaAfter).trim() === "";
	const insertAt = hasTrailingComma ? lastEnd + commaAfter + 1 : lastEnd;
	const missingComma = hasTrailingComma ? "" : ",";
	const spansLines = source
		.slice(array.range().start.index, last.range().start.index)
		.includes("\n");
	if (!spansLines) {
		return root.commitEdits([
			{
				startPos: insertAt,
				endPos: insertAt,
				insertedText: `${missingComma} ${text},`,
			},
		]);
	}
	// Sibling indent, not a hard-coded one: the last element's own line indent.
	const indent = source.slice(
		lineStartOf(source, last.range().start.index),
		last.range().start.index,
	);
	return root.commitEdits([
		{
			startPos: insertAt,
			endPos: insertAt,
			insertedText: `${missingComma}\n${indent}${text},`,
		},
	]);
};

const collectionArray = ({
	anchor,
	collection,
}: {
	anchor: SgNode;
	collection: string;
}): SgNode | null => {
	for (const array of anchor.findAll({ rule: { kind: "array" } })) {
		const pair = array.parent();
		if (pair === null || pair.kind() !== "pair") continue;
		const key = pair.namedChildren()[0];
		if (key !== undefined && key.text() === collection) return array;
	}
	return null;
};
