import { type Edit, Lang, parse, type SgNode } from "@ast-grep/napi";
import { type FixtureConstraint, findFixture } from "./findFixture";
import {
	leadingIndentOfLine,
	lineEndInclusive,
	lineEndOf,
	lineStartOf,
} from "./fixtureEdit";

const pairFor = ({
	object,
	property,
}: {
	object: SgNode;
	property: string;
}): SgNode | null => {
	for (const member of object.children()) {
		if (member.kind() !== "pair") continue;
		const [key] = member.namedChildren();
		const name = key?.text().replace(/^["']|["']$/g, "");
		if (name === property) return member;
	}
	return null;
};

/** The string a fixture call states for one top-level property, or null. */
export const fixturePropertyString = ({
	call,
	property,
}: {
	call: SgNode;
	property: string;
}): string | null => {
	const object = call.field("arguments")?.namedChildren()[0];
	if (object === undefined || object.kind() !== "object") return null;
	const pair = pairFor({ object, property });
	const value = pair?.namedChildren()[1];
	if (value === undefined || value.kind() !== "string") return null;
	return value.text().slice(1, -1);
};

/** Remove a pair: its line when it stands alone, else the pair plus one adjacent comma. */
const removePairEdit = ({
	source,
	pair,
}: {
	source: string;
	pair: SgNode;
}): Edit => {
	const start = pair.range().start.index;
	const end = pair.range().end.index;
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
		return {
			startPos: lineStart,
			endPos: lineEndInclusive(source, end),
			insertedText: "",
		};
	}
	if (hasTrailingComma) {
		const afterComma = end + commaIndex + 1;
		const spacing = /^[ \t]*/.exec(source.slice(afterComma))?.[0].length ?? 0;
		return { startPos: start, endPos: afterComma + spacing, insertedText: "" };
	}
	const commaBefore = source.lastIndexOf(",", start);
	return {
		startPos: commaBefore === -1 ? start : commaBefore,
		endPos: end,
		insertedText: "",
	};
};

/** Append a pair after the object's last one, matching the object's own layout. */
const insertPairEdit = ({
	source,
	object,
	property,
	text,
}: {
	source: string;
	object: SgNode;
	property: string;
	text: string;
}): Edit => {
	const pairs = object.children().filter((child) => child.kind() === "pair");
	const closing = object.range().end.index - 1;
	const multiline = source
		.slice(object.range().start.index, closing)
		.includes("\n");
	const last = pairs.at(-1);
	if (last === undefined) {
		return multiline
			? {
					startPos: lineStartOf(source, closing),
					endPos: lineStartOf(source, closing),
					insertedText: `${leadingIndentOfLine(source, object.range().start.index)}\t${property}: ${text},\n`,
				}
			: {
					startPos: object.range().start.index + 1,
					endPos: closing,
					insertedText: ` ${property}: ${text} `,
				};
	}
	const lastEnd = last.range().end.index;
	const between = source.slice(lastEnd, closing);
	const trailingComma = between.trimStart().startsWith(",");
	if (multiline) {
		const indent = leadingIndentOfLine(source, last.range().start.index);
		const lineEnd = lineEndInclusive(source, lastEnd);
		return {
			startPos: lineEnd,
			endPos: lineEnd,
			insertedText: `${indent}${property}: ${text},\n`,
		};
	}
	const afterComma = trailingComma
		? lastEnd + between.indexOf(",") + 1
		: lastEnd;
	return {
		startPos: afterComma,
		endPos: afterComma,
		insertedText: trailingComma
			? ` ${property}: ${text},`
			: `, ${property}: ${text}`,
	};
};

/**
 * Set one top-level property of a fixture literal to raw source text: overwrite
 * it where it stands, append it when absent, remove it when `text` is null.
 * Everything else in the literal keeps its bytes. Null when the fixture is not there.
 */
export const patchFixtureProperty = ({
	source,
	builder,
	idField,
	id,
	where,
	property,
	text,
}: {
	source: string;
	builder: string;
	idField: string;
	id: string;
	where?: FixtureConstraint[];
	property: string;
	text: string | null;
}): string | null => {
	const call = findFixture({ source, builder, idField, id, where });
	if (call === null) return null;
	const object = call.field("arguments")?.namedChildren()[0];
	if (object === undefined || object.kind() !== "object") return null;
	const root = parse(Lang.TypeScript, source).root();
	const pair = pairFor({ object, property });
	if (text === null) {
		if (pair === null) return source;
		return root.commitEdits([removePairEdit({ source, pair })]);
	}
	if (pair === null) {
		return root.commitEdits([
			insertPairEdit({ source, object, property, text }),
		]);
	}
	const [, current] = pair.namedChildren();
	if (current === undefined) return null;
	return root.commitEdits([
		{
			startPos: current.range().start.index,
			endPos: current.range().end.index,
			insertedText: text,
		},
	]);
};
