import { Lang, parse, type SgNode } from "@ast-grep/napi";
import { appendPropertyEdit } from "./appendPropertyEdit";
import { lineStartOf } from "./fixtureEdit";
import { insertCollection } from "./insertCollection";

/** One key of a singleton block, and the literal it should hold — or nothing. */
export type SingletonEdit = { key: string; text: string | null };

const atmnObject = (root: SgNode): SgNode | null => {
	const object = root.find("atmn($ARG)")?.getMatch("ARG") ?? null;
	return object !== null && object.kind() === "object" ? object : null;
};

const pairFor = ({
	object,
	key,
}: {
	object: SgNode;
	key: string;
}): SgNode | null => {
	for (const member of object.children()) {
		if (member.kind() !== "pair") continue;
		const [name] = member.namedChildren();
		if (name?.text().replace(/^["']|["']$/g, "") === key) return member;
	}
	return null;
};

/** Remove a pair with its line when it stands alone, else with one adjacent comma. */
const removePairEdit = ({
	source,
	pair,
}: {
	source: string;
	pair: SgNode;
}): { startPos: number; endPos: number; insertedText: string } => {
	const start = pair.range().start.index;
	const end = pair.range().end.index;
	const lineStart = lineStartOf(source, start);
	const newline = source.indexOf("\n", end);
	const lineEnd = newline === -1 ? source.length : newline;
	const after = source.slice(end, lineEnd);
	const commaIndex = after.indexOf(",");
	const hasTrailingComma =
		commaIndex !== -1 && after.slice(0, commaIndex).trim() === "";
	const rest = hasTrailingComma ? after.slice(commaIndex + 1) : after;
	if (source.slice(lineStart, start).trim() === "" && rest.trim() === "") {
		return {
			startPos: lineStart,
			endPos: newline === -1 ? source.length : newline + 1,
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
 * One edit to the `<singleton>: { ... }` block of the `atmn()` object: set a
 * key's literal where it stands, append it when absent, drop it when `text`
 * is null. The block is seeded as `{}` when the config has no such key.
 * Null when the block is not a plain object literal this can edit.
 */
export const patchSingletonProperty = ({
	source,
	singleton,
	edit,
}: {
	source: string;
	singleton: string;
	edit: SingletonEdit;
}): string | null => {
	// A removal from a block the config never had is nothing to do; seeding
	// the block for it would state `settings: {}`, which manages nothing.
	const seeded =
		edit.text === null ? source : insertSingleton({ source, singleton });
	if (seeded === null) return null;
	const root = parse(Lang.TypeScript, seeded).root();
	const object = atmnObject(root);
	if (object === null) return null;
	const pair = pairFor({ object, key: singleton });
	if (pair === null) return edit.text === null ? seeded : null;
	const block = pair.namedChildren()[1];
	if (block === undefined || block.kind() !== "object") return null;

	const existing = pairFor({ object: block, key: edit.key });
	if (edit.text === null) {
		if (existing === null) return seeded;
		// The last pair out leaves `{}`, never `{ }` or a dangling comma.
		const onlyPair =
			block.children().filter((child) => child.kind() === "pair").length === 1;
		return root.commitEdits([
			onlyPair
				? {
						startPos: block.range().start.index,
						endPos: block.range().end.index,
						insertedText: "{}",
					}
				: removePairEdit({ source: seeded, pair: existing }),
		]);
	}
	if (existing === null) {
		return root.commitEdits([
			appendPropertyEdit({
				source: seeded,
				object: block,
				pair: `${edit.key}: ${edit.text}`,
			}),
		]);
	}
	const [, current] = existing.namedChildren();
	if (current === undefined) return null;
	return root.commitEdits([
		{
			startPos: current.range().start.index,
			endPos: current.range().end.index,
			insertedText: edit.text,
		},
	]);
};

/** `settings: {}` beside the collections, when the config has no such key. */
const insertSingleton = ({
	source,
	singleton,
}: {
	source: string;
	singleton: string;
}): string | null => {
	const withArray = insertCollection({ source, collection: singleton });
	if (withArray === null || withArray === source) return withArray;
	// insertCollection seeds `key: []`; a singleton is an object.
	const root = parse(Lang.TypeScript, withArray).root();
	const object = atmnObject(root);
	const pair = object === null ? null : pairFor({ object, key: singleton });
	const value = pair?.namedChildren()[1];
	if (value === undefined || value.kind() !== "array") return null;
	return root.commitEdits([
		{
			startPos: value.range().start.index,
			endPos: value.range().end.index,
			insertedText: "{}",
		},
	]);
};

/** The literal text a singleton block states for one key, or null. */
export const singletonPropertyText = ({
	source,
	singleton,
	key,
}: {
	source: string;
	singleton: string;
	key: string;
}): string | null => {
	const root = parse(Lang.TypeScript, source).root();
	const object = atmnObject(root);
	if (object === null) return null;
	const block = pairFor({ object, key: singleton })?.namedChildren()[1];
	if (block === undefined || block.kind() !== "object") return null;
	return pairFor({ object: block, key })?.namedChildren()[1]?.text() ?? null;
};
