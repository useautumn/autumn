import type { SgNode } from "@ast-grep/napi";
import { type FixtureConstraint, findFixture } from "./findFixture";
import { lineStartOf, removeArrayElementEdits } from "./fixtureEdit";

export const deleteFixtureLiteral = ({
	source,
	builder,
	idField,
	id,
	where,
}: {
	source: string;
	builder: string;
	idField: string;
	id: string;
	where?: FixtureConstraint[];
}): { source: string; exportedName?: string } | null => {
	const call = findFixture({ source, builder, idField, id, where });
	if (call === null) return null;
	const root = call.getRoot().root();
	// The nearer ancestor wins: an element of `export default atmn({ features: [
	// ...] })` is still an array element, not an exported fixture statement.
	let statement: SgNode | null = null;
	let isArrayElement = false;
	for (const ancestor of call.ancestors()) {
		if (ancestor.kind() === "array") {
			isArrayElement = true;
			break;
		}
		if (ancestor.kind() === "export_statement") {
			statement = ancestor;
			break;
		}
	}
	if (statement !== null && !isArrayElement) {
		const declarator = statement.find({
			rule: { kind: "variable_declarator" },
		});
		const name = declarator?.namedChildren()[0];
		if (name === undefined || name.kind() !== "identifier") return null;
		return {
			source: root.commitEdits([exportRemovalEdit({ source, statement })]),
			exportedName: name.text(),
		};
	}
	const parent = call.parent();
	if (parent === null || parent.kind() !== "array") return null;
	const elementEdits = removeArrayElementEdits({ source, element: call });
	if (elementEdits === null) return null;
	return { source: root.commitEdits(elementEdits) };
};

/**
 * Remove the whole statement line, a doc comment directly above it (exactly one
 * newline between comment and statement), and the blank line above the comment.
 */
const exportRemovalEdit = ({
	source,
	statement,
}: {
	source: string;
	statement: SgNode;
}): { startPos: number; endPos: number; insertedText: string } => {
	const statementLineStart = lineStartOf(source, statement.range().start.index);
	let deleteStart = statementLineStart;
	const comment = statement.prev();
	if (
		comment !== null &&
		comment.kind() === "comment" &&
		source.slice(comment.range().end.index, statementLineStart) === "\n"
	) {
		deleteStart = lineStartOf(source, comment.range().start.index);
		const lineAbove = lineStartOf(source, deleteStart - 1);
		if (deleteStart > 0 && source.slice(lineAbove, deleteStart).trim() === "") {
			deleteStart = lineAbove;
		}
	}
	const lineEnd = source.indexOf("\n", statement.range().end.index);
	const deleteEnd = lineEnd === -1 ? source.length : lineEnd + 1;
	return { startPos: deleteStart, endPos: deleteEnd, insertedText: "" };
};
