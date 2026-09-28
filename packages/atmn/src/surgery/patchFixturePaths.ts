import { isDeepStrictEqual } from "node:util";
import { type Edit, Lang, parse, type SgNode } from "@ast-grep/napi";
import { appendPropertyEdit } from "./appendPropertyEdit";
import {
	type FixtureConstraint,
	type FixtureShape,
	findFixtures,
	fixtureObjectOf,
} from "./findFixture";
import { lineEndOf, lineStartOf } from "./fixtureEdit";
import {
	DYNAMIC_VALUE,
	fixtureArrayElements,
	fixtureKeyOf,
	readFixtureValue,
} from "./readFixtureValue";

type Assignment = { path: (string | number)[]; text: string | null };
type PatchResult = {
	source: string;
	skipped: { path: (string | number)[]; reason: string }[];
};

const isDynamic = (value: unknown): boolean => {
	if (value === DYNAMIC_VALUE) return true;
	if (value === null || typeof value !== "object") return false;
	return Object.values(value).some(isDynamic);
};

const matchesLiteral = ({
	value,
	text,
}: {
	value: unknown;
	text: string;
}): boolean => {
	const root = parse(Lang.TypeScript, `const value = (${text});`).root();
	if (root.find({ rule: { kind: "ERROR" } }) !== null) return false;
	const expression = root
		.find({ rule: { kind: "variable_declarator" } })
		?.field("value");
	if (expression?.kind() !== "parenthesized_expression") return false;
	const literal = expression
		.namedChildren()
		.filter((node) => node.kind() !== "comment");
	if (literal.length !== 1 || literal[0] === undefined) return false;
	const proposed = readFixtureValue({ node: literal[0] });
	return !isDynamic(proposed) && isDeepStrictEqual(value, proposed);
};

const PLAIN_IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

/** Inserted keys are quoted unless the caller asks for identifiers where they are valid. */
const keyText = ({
	key,
	bareKeys,
}: {
	key: string;
	bareKeys: boolean;
}): string =>
	bareKeys && PLAIN_IDENTIFIER.test(key) ? key : JSON.stringify(key);

/** A member alone on its line goes with the whole line, its own trailing comment included. */
const wholeLineEdit = ({
	source,
	member,
	comma,
}: {
	source: string;
	member: SgNode;
	comma: SgNode | null;
}): Edit | null => {
	const start = member.range().start.index;
	const lineStart = lineStartOf(source, start);
	if (source.slice(lineStart, start).trim() !== "") return null;
	const end = Math.max(member.range().end.index, comma?.range().end.index ?? 0);
	const lineEnd = lineEndOf(source, end);
	if (!/^\s*(\/\/.*)?$/.test(source.slice(end, lineEnd))) return null;
	return {
		startPos: lineStart,
		endPos: Math.min(lineEnd + 1, source.length),
		insertedText: "",
	};
};

const removeMemberEdits = ({
	source,
	member,
}: {
	source: string;
	member: SgNode;
}): Edit[] => {
	const siblings = member.parent()?.children() ?? [];
	const index = siblings.findIndex(
		(sibling) => sibling.range().start.index === member.range().start.index,
	);
	const next = siblings
		.slice(index + 1)
		.find((sibling) => sibling.kind() !== "comment");
	const previous = siblings
		.slice(0, index)
		.reverse()
		.find((sibling) => sibling.kind() !== "comment");
	const comma =
		next?.kind() === "," ? next : previous?.kind() === "," ? previous : null;
	const line =
		comma === next || comma === null
			? wholeLineEdit({ source, member, comma })
			: null;
	if (line !== null) return [line];
	return [member, ...(comma === null ? [] : [comma])].map((node) => ({
		startPos: node.range().start.index,
		endPos: node.range().end.index,
		insertedText: "",
	}));
};

const pathEdits = ({
	source,
	object,
	path,
	text,
	builders,
	bareKeys,
}: {
	source: string;
	object: SgNode;
	builders: readonly string[];
	bareKeys: boolean;
} & Assignment): Edit[] | string => {
	let current = object;
	for (let index = 0; index < path.length; index += 1) {
		if (
			current.kind() === "call_expression" &&
			builders.includes(current.field("function")?.text() ?? "")
		) {
			const args = current
				.field("arguments")
				?.namedChildren()
				.filter((child) => child.kind() !== "comment");
			if (args?.length !== 1 || args[0]?.kind() !== "object")
				return "dynamic-value";
			current = args[0];
		}
		const segment = path[index];
		const last = index === path.length - 1;
		let member: SgNode | undefined;
		let value: SgNode | null | undefined;
		if (typeof segment === "number") {
			if (
				current.kind() !== "array" ||
				!Number.isSafeInteger(segment) ||
				segment < 0
			)
				return "invalid-array-path";
			const elements = fixtureArrayElements({ node: current });
			if (elements === null) return "dynamic-array";
			value = elements[segment];
			if (value === undefined) return "missing-array-element";
			if (last && text === null) return "array-element-removal";
		} else {
			if (current.kind() !== "object") return "non-object-container";
			if (readFixtureValue({ node: current }) === DYNAMIC_VALUE)
				return "ambiguous-object";
			member = current.namedChildren().find((child) => {
				const key = child.kind() === "pair" ? child.field("key") : child;
				return key !== null && fixtureKeyOf({ node: key }) === segment;
			});
			if (member === undefined) {
				if (text === null) return [];
				const remaining = path.slice(index + 1);
				if (remaining.some((key) => typeof key === "number"))
					return "missing-array-element";
				let inserted = text;
				for (const key of remaining.reverse())
					inserted = `{ ${keyText({ key: String(key), bareKeys })}: ${inserted} }`;
				const pair = `${keyText({ key: segment, bareKeys })}: ${inserted}`;
				const members = current
					.namedChildren()
					.filter((child) => child.kind() !== "comment");
				if (members.length === 0) {
					const closing = current.range().end.index - 1;
					return [
						{ startPos: closing, endPos: closing, insertedText: ` ${pair} ` },
					];
				}
				return [appendPropertyEdit({ source, object: current, pair })];
			}
			value = member.field("value");
		}
		if (value == null) return "dynamic-value";
		if (!last) {
			current = value;
			continue;
		}
		const currentValue = readFixtureValue({ node: value });
		if (isDynamic(currentValue)) return "dynamic-value";
		if (text === null)
			return member === undefined
				? "array-element-removal"
				: removeMemberEdits({ source, member });
		if (matchesLiteral({ value: currentValue, text })) return [];
		return [
			{
				startPos: value.range().start.index,
				endPos: value.range().end.index,
				insertedText: text,
			},
		];
	}
	return "empty-path";
};

export const patchFixturePaths = ({
	source,
	builder,
	idField,
	id,
	where,
	assignments,
	builders = [],
	bareKeys = false,
}: {
	source: string;
	builder: FixtureShape;
	idField: string;
	id: string;
	where?: FixtureConstraint[];
	assignments: Assignment[];
	builders?: readonly string[];
	/** Write an inserted key bare when it is a valid identifier. */
	bareKeys?: boolean;
}): PatchResult | null => {
	const selector = { builder, idField, id, where, allowDynamic: true };
	const initial = findFixtures({ source, ...selector });
	if (initial.length === 0) return null;
	const skipped: PatchResult["skipped"] = [];
	for (const assignment of assignments) {
		const matches = findFixtures({ source, ...selector });
		const match = matches[0];
		const object =
			matches.length === 1 && match !== undefined
				? fixtureObjectOf(match)
				: null;
		const edits =
			object === null
				? "ambiguous-fixture"
				: pathEdits({ source, object, builders, bareKeys, ...assignment });
		if (typeof edits === "string") {
			skipped.push({ path: assignment.path, reason: edits });
			continue;
		}
		source = parse(Lang.TypeScript, source).root().commitEdits(edits);
	}
	return { source, skipped };
};
