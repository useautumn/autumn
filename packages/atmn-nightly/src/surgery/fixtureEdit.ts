import type { Edit, SgNode } from "@ast-grep/napi";

// Kinds that make an object literal's value dynamic, so a fixture built from it
// cannot be rewritten as bytes. `property_identifier` (keys) is a different kind.
export const dynamicValueKinds = [
	"identifier",
	"member_expression",
	"call_expression",
	"spread_element",
	"computed_property_name",
] as const;

export const containsDynamicValue = (node: SgNode): boolean => {
	if (dynamicValueKinds.some((dynamicKind) => node.kind() === dynamicKind))
		return true;
	for (const child of node.children()) {
		if (containsDynamicValue(child)) return true;
	}
	return false;
};

export const lineStartOf = (source: string, index: number): number =>
	index <= 0 ? 0 : source.lastIndexOf("\n", index - 1) + 1;

export const lineEndOf = (source: string, index: number): number => {
	const newline = source.indexOf("\n", index);
	return newline === -1 ? source.length : newline;
};

/** End of the line containing `index`, inclusive of the newline when present. */
export const lineEndInclusive = (source: string, index: number): number => {
	const lineEnd = lineEndOf(source, index);
	return lineEnd < source.length ? lineEnd + 1 : lineEnd;
};

export const leadingIndentOfLine = (source: string, index: number): string => {
	const lineStart = lineStartOf(source, index);
	const match = /^\s*/.exec(source.slice(lineStart));
	return match === null ? "" : match[0];
};

export const importStatementOf = (node: SgNode): SgNode | null => {
	for (const ancestor of node.ancestors()) {
		if (ancestor.kind() === "import_statement") return ancestor;
	}
	return null;
};

/** Remove a node together with its line: leading indentation through the newline. */
export const removeLineEdit = ({
	source,
	node,
}: {
	source: string;
	node: SgNode;
}): Edit => ({
	startPos: lineStartOf(source, node.range().start.index),
	endPos: lineEndInclusive(source, node.range().end.index),
	insertedText: "",
});

/**
 * Remove an element from an array: its line when it stands alone (trailing comma
 * included), a collapse to `[]` when it is the sole element, or just the element
 * plus one adjacent comma when it shares a line with siblings.
 */
export const removeArrayElementEdits = ({
	source,
	element,
}: {
	source: string;
	element: SgNode;
}): Array<Edit> | null => {
	const parent = element.parent();
	if (parent === null || parent.kind() !== "array") return null;
	if (parent.namedChildren().length === 1) {
		return [
			{
				startPos: parent.range().start.index,
				endPos: parent.range().end.index,
				insertedText: "[]",
			},
		];
	}
	const start = element.range().start.index;
	const end = element.range().end.index;
	const lineStart = lineStartOf(source, start);
	const lineEnd = lineEndOf(source, end);
	const after = source.slice(end, lineEnd);
	const commaIndex = after.indexOf(",");
	const hasTrailingComma =
		commaIndex !== -1 && after.slice(0, commaIndex).trim() === "";
	const restAfterComma = hasTrailingComma ? after.slice(commaIndex + 1) : after;
	const standsAlone =
		source.slice(lineStart, start).trim() === "" &&
		restAfterComma.trim() === "";
	if (standsAlone) {
		return [
			{
				startPos: lineStart,
				endPos: lineEndInclusive(source, end),
				insertedText: "",
			},
		];
	}
	if (hasTrailingComma) {
		// Inline siblings: take the comma and the spacing before the next one.
		const afterComma = end + commaIndex + 1;
		const spacing = /^[ \t]*/.exec(source.slice(afterComma))?.[0].length ?? 0;
		return [
			{ startPos: start, endPos: afterComma + spacing, insertedText: "" },
		];
	}
	const commaBefore = source.lastIndexOf(",", start);
	return [
		{
			startPos: commaBefore === -1 ? start : commaBefore,
			endPos: end,
			insertedText: "",
		},
	];
};

/** Remove an import specifier plus one adjacent comma, keeping the statement. */
export const removeSpecifierEdit = ({
	source,
	specifier,
}: {
	source: string;
	specifier: SgNode;
}): Edit => {
	const start = specifier.range().start.index;
	const end = specifier.range().end.index;
	const after = source.slice(end);
	const commaAfter = after.indexOf(",");
	if (commaAfter !== -1 && after.slice(0, commaAfter).trim() === "") {
		// Take the space after the comma too, or `{ a, b }` becomes `{  b }`.
		const afterComma = end + commaAfter + 1;
		const spaces = /^[ \t]*/.exec(source.slice(afterComma))?.[0].length ?? 0;
		return { startPos: start, endPos: afterComma + spaces, insertedText: "" };
	}
	const commaBefore = source.lastIndexOf(",", start);
	return {
		startPos: commaBefore === -1 ? start : commaBefore,
		endPos: end,
		insertedText: "",
	};
};
