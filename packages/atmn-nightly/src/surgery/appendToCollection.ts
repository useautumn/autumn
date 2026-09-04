import type { SgNode } from "@ast-grep/napi";
import { Lang, parse } from "@ast-grep/napi";
import { type AppendText, appendElementToArray } from "./appendToArray";

export const appendToCollection = ({
	source,
	collection,
	text,
}: {
	source: string;
	collection: string;
	text: AppendText;
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
	return appendElementToArray({ source, root, array, text });
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
