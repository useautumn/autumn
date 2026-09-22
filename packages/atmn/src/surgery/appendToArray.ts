import type { SgNode } from "@ast-grep/napi";
import { leadingIndentOfLine, lineStartOf } from "./fixtureEdit";

/** A function is built against the indent its first line will receive. */
export type AppendText = string | ((elementIndent: string) => string);

/** Append one element to an array literal, matching its siblings' indent and
 * comma style; an empty array is reflowed onto its own lines. With `after`,
 * the element lands right behind the last sibling the predicate accepts. */
export const appendElementToArray = ({
	source,
	root,
	array,
	text,
	after,
}: {
	source: string;
	root: SgNode;
	array: SgNode;
	text: AppendText;
	after?: (element: SgNode) => boolean;
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
	let anchorIndex = -1;
	if (after !== undefined) {
		for (let index = elements.length - 1; index >= 0; index -= 1) {
			if (after(elements[index])) {
				anchorIndex = index;
				break;
			}
		}
	}
	const anchor = anchorIndex === -1 ? last : elements[anchorIndex];
	const anchorEnd = anchor.range().end.index;
	const rest = source.slice(anchorEnd);
	const commaAfter = rest.indexOf(",");
	const hasTrailingComma =
		commaAfter !== -1 && rest.slice(0, commaAfter).trim() === "";
	const insertAt = hasTrailingComma ? anchorEnd + commaAfter + 1 : anchorEnd;
	const missingComma = hasTrailingComma ? "" : ",";
	const spansLines = source
		.slice(array.range().start.index, last.range().start.index)
		.includes("\n");
	if (spansLines) {
		// Sibling indent: the whitespace opening the anchor element's line.
		const indent = leadingIndentOfLine(source, anchor.range().start.index);
		const resolved = resolveText({ text, elementIndent: indent });
		return root.commitEdits([
			{
				startPos: insertAt,
				endPos: insertAt,
				insertedText: `${missingComma}\n${indent}${resolved},`,
			},
		]);
	}
	const lineIndent = leadingIndentOfLine(source, array.range().start.index);
	const elementIndent = `${lineIndent}\t`;
	const resolved = resolveText({ text, elementIndent });
	if (!resolved.includes("\n")) {
		return root.commitEdits([
			{
				startPos: insertAt,
				endPos: insertAt,
				insertedText: `${missingComma} ${resolved},`,
			},
		]);
	}
	// A one-line array cannot hold a multi-line element inline: reflow it.
	const texts = elements.map((element) => element.text());
	const position = anchorIndex === -1 ? texts.length : anchorIndex + 1;
	texts.splice(position, 0, resolved);
	const lines = texts.map((element) => `${elementIndent}${element},`);
	return root.commitEdits([
		{
			startPos: array.range().start.index,
			endPos: array.range().end.index,
			insertedText: `[\n${lines.join("\n")}\n${lineIndent}]`,
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
