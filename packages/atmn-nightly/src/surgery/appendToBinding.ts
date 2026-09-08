import { Lang, parse } from "@ast-grep/napi";
import { type AppendText, appendElementToArray } from "./appendToArray";
import { findArrayBinding } from "./arrayBinding";

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
	const array = findArrayBinding({ root, name });
	if (array === null) return null;
	return appendElementToArray({ source, root, array, text });
};
