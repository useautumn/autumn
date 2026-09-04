import type { SgNode } from "@ast-grep/napi";
import { leadingIndentOfLine, lineStartOf } from "./fixtureEdit";

/** A function is built against the indent its first line will receive. */
export type AppendText = string | ((elementIndent: string) => string);

/** Append one element to an array literal, matching its siblings' indent and
 * comma style; an empty array is reflowed onto its own lines. */
export const appendElementToArray = ({
	source,
	root,
	array,
	text,
}: {
	source: string;
	root: SgNode;
	array: SgNode;
	text: AppendText;
}): string => {
	const elements = array.namedChildren();
	if (elements.length === 0) {
		const indent = leadingIndentOfLine(source, array.range().start.index);
		// The seeded element's first line lands one tab deeper than the array.
		const resolved = resolveText({ text, elementIndent: `${indent}\t` });
		return root.commitEdits([
			{
				startPos: array.range().start.index,
				endPos: array.range().end.index,
				insertedText: `[\n${indent}\t${resolved},\n${indent}]`,
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
	// Sibling indent, not a hard-coded one: the last element's own line indent.
	const indent = source.slice(
		lineStartOf(source, last.range().start.index),
		last.range().start.index,
	);
	const resolved = resolveText({ text, elementIndent: indent });
	if (!spansLines) {
		return root.commitEdits([
			{
				startPos: insertAt,
				endPos: insertAt,
				insertedText: `${missingComma} ${resolved},`,
			},
		]);
	}
	return root.commitEdits([
		{
			startPos: insertAt,
			endPos: insertAt,
			insertedText: `${missingComma}\n${indent}${resolved},`,
		},
	]);
};

const resolveText = ({
	text,
	elementIndent,
}: {
	text: AppendText;
	elementIndent: string;
}): string => (typeof text === "function" ? text(elementIndent) : text);
