import { Lang, parse } from "@ast-grep/napi";
import { type AppendText, appendElementToArray } from "./appendToArray";

/** Append to `const name = [...]`, exported or not; null when no such array literal exists. */
export const appendToBinding = ({
	source,
	name,
	text,
}: {
	source: string;
	name: string;
	text: AppendText;
}): string | null => {
	const root = parse(Lang.TypeScript, source).root();
	const declaration = root.find(`const ${name} = [$$$ITEMS]`);
	if (declaration === null) return null;
	// Pre-order: the initializer itself comes before any array nested in it.
	const array = declaration.find({ rule: { kind: "array" } });
	if (array === null) return null;
	return appendElementToArray({ source, root, array, text });
};
