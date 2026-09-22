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
	// A comment is a named child too, but never an element.
	const elements = array
		.namedChildren()
		.filter((child) => child.kind() !== "comment");
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
	const { insertAt, hasTrailingComma } = insertionAfter({
		source,
		array,
		anchor,
	});
	// A missing comma goes straight after the anchor, ahead of any comment.
	const commaEdits = hasTrailingComma
		? []
		: [
				{
					startPos: anchor.range().end.index,
					endPos: anchor.range().end.index,
					insertedText: ",",
				},
			];
	const spansLines = source
		.slice(array.range().start.index, last.range().start.index)
		.includes("\n");
	if (spansLines) {
		// Sibling indent: the whitespace opening the anchor element's line.
		const indent = leadingIndentOfLine(source, anchor.range().start.index);
		const resolved = resolveText({ text, elementIndent: indent });
		return root.commitEdits([
			...commaEdits,
			{
				startPos: insertAt,
				endPos: insertAt,
				insertedText: `\n${indent}${resolved},`,
			},
		]);
	}
	const lineIndent = leadingIndentOfLine(source, array.range().start.index);
	const elementIndent = `${lineIndent}\t`;
	const resolved = resolveText({ text, elementIndent });
	if (!resolved.includes("\n")) {
		return root.commitEdits([
			...commaEdits,
			{
				startPos: insertAt,
				endPos: insertAt,
				insertedText: ` ${resolved},`,
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

/** Where the next element goes: past the anchor's comma and any comment that
 * shares its line, so `plan() /* note *\/,` and `plan(), // legacy` keep their trivia. */
const insertionAfter = ({
	source,
	array,
	anchor,
}: {
	source: string;
	array: SgNode;
	anchor: SgNode;
}): { insertAt: number; hasTrailingComma: boolean } => {
	const children = array.children();
	const start = children.findIndex(
		(child) => child.range().start.index === anchor.range().start.index,
	);
	let insertAt = anchor.range().end.index;
	let hasTrailingComma = false;
	for (const child of children.slice(start + 1)) {
		const kind = child.kind();
		if (kind === ",") {
			if (hasTrailingComma) break;
			hasTrailingComma = true;
			insertAt = child.range().end.index;
			continue;
		}
		if (kind !== "comment") break;
		const sameLine = !source
			.slice(insertAt, child.range().start.index)
			.includes("\n");
		if (!sameLine) break;
		insertAt = child.range().end.index;
	}
	return { insertAt, hasTrailingComma };
};

const resolveText = ({
	text,
	elementIndent,
}: {
	text: AppendText;
	elementIndent: string;
}): string => (typeof text === "function" ? text(elementIndent) : text);
