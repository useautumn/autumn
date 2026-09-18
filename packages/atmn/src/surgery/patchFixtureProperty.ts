import { type Edit, Lang, parse, type SgNode } from "@ast-grep/napi";
import { appendPropertyEdit } from "./appendPropertyEdit";
import {
	type FixtureConstraint,
	type FixtureShape,
	findFixture,
	fixtureObjectOf,
} from "./findFixture";
import { lineEndInclusive, lineEndOf, lineStartOf } from "./fixtureEdit";

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

/** Whether the fixture states this top-level property at all. A dynamic value
 * counts: it still wins over a pair inserted beside it. */
export const fixtureStatesProperty = ({
	call,
	property,
}: {
	call: SgNode;
	property: string;
}): boolean => {
	const object = fixtureObjectOf(call);
	if (object === null) return false;
	return pairFor({ object, property }) !== null;
};

/** The string a fixture literal states for one top-level property, or null. */
export const fixturePropertyString = ({
	call,
	property,
}: {
	call: SgNode;
	property: string;
}): string | null => {
	const object = fixtureObjectOf(call);
	if (object === null) return null;
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
	builder: FixtureShape;
	idField: string;
	id: string;
	where?: FixtureConstraint[];
	property: string;
	text: string | null;
}): string | null => {
	// A splice keeps every other byte, so a literal the pull rewriter refuses
	// (it names another fixture) still takes the new value.
	const call = findFixture({
		source,
		builder,
		idField,
		id,
		where,
		allowDynamic: true,
	});
	if (call === null) return null;
	const object = fixtureObjectOf(call);
	if (object === null) return null;
	const root = parse(Lang.TypeScript, source).root();
	const pair = pairFor({ object, property });
	if (text === null) {
		if (pair === null) return source;
		return root.commitEdits([removePairEdit({ source, pair })]);
	}
	if (pair === null) {
		return root.commitEdits([
			appendPropertyEdit({ source, object, pair: `${property}: ${text}` }),
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
