import type { SgNode } from "@ast-grep/napi";
import { stringLiteralValue } from "./findFixture";

export const DYNAMIC_VALUE = Symbol("dynamic-fixture-value");

export const fixtureKeyOf = ({ node }: { node: SgNode }): string | null => {
	if (
		node.kind() === "property_identifier" ||
		node.kind() === "shorthand_property_identifier"
	)
		return node.text();
	return stringLiteralValue(node);
};

export const fixtureArrayElements = ({
	node,
}: {
	node: SgNode;
}): SgNode[] | null => {
	const elements: SgNode[] = [];
	let expectsElement = true;
	for (const child of node.children()) {
		const kind = child.kind();
		if (kind === "[" || kind === "]" || kind === "comment") continue;
		if (kind === ",") {
			if (expectsElement) return null;
			expectsElement = true;
			continue;
		}
		if (!expectsElement || kind === "spread_element") return null;
		elements.push(child);
		expectsElement = false;
	}
	return elements;
};

export const readFixtureValue = ({
	node,
	builders = [],
}: {
	node: SgNode;
	builders?: readonly string[];
}): unknown => {
	const kind = node.kind();
	if (
		kind === "call_expression" &&
		builders.includes(node.field("function")?.text() ?? "")
	) {
		const args = node
			.field("arguments")
			?.namedChildren()
			.filter((child) => child.kind() !== "comment");
		return args?.length === 1 && args[0]?.kind() === "object"
			? readFixtureValue({ node: args[0], builders })
			: DYNAMIC_VALUE;
	}
	if (kind === "string") return stringLiteralValue(node) ?? DYNAMIC_VALUE;
	if (kind === "true") return true;
	if (kind === "false") return false;
	if (kind === "null") return null;
	if (
		kind === "number" ||
		(kind === "unary_expression" && /^[+-]\s*[\d.]/.test(node.text()))
	) {
		const value = Number(node.text().replaceAll("_", "").replace(/\s/g, ""));
		return Number.isFinite(value) ? value : DYNAMIC_VALUE;
	}
	if (kind === "array") {
		const elements = fixtureArrayElements({ node });
		return elements === null
			? DYNAMIC_VALUE
			: elements.map((element) =>
					readFixtureValue({ node: element, builders }),
				);
	}
	if (kind !== "object") return DYNAMIC_VALUE;
	const value: Record<string, unknown> = {};
	for (const member of node.namedChildren()) {
		if (member.kind() === "comment") continue;
		const shorthand = member.kind() === "shorthand_property_identifier";
		if (member.kind() !== "pair" && !shorthand) return DYNAMIC_VALUE;
		const keyNode = shorthand ? member : member.field("key");
		const key = keyNode === null ? null : fixtureKeyOf({ node: keyNode });
		if (
			key === null ||
			Object.getOwnPropertyDescriptor(value, key) !== undefined
		)
			return DYNAMIC_VALUE;
		const child = member.field("value");
		Object.defineProperty(value, key, {
			value:
				child === null
					? DYNAMIC_VALUE
					: readFixtureValue({ node: child, builders }),
			enumerable: true,
		});
	}
	return value;
};
