import type { Edit, SgNode } from "@ast-grep/napi";
import { leadingIndentOfLine, lineStartOf } from "./fixtureEdit";

const isMember = (child: SgNode): boolean =>
	child.kind() === "pair" || child.kind() === "spread_element";

/**
 * Append a pair after the literal's last member, spreads counted. A spread
 * that appears later overrides an earlier key at runtime, so a pair this
 * rewriter means to take effect only wins from the end.
 */
export const appendPropertyEdit = ({
	source,
	object,
	pair,
}: {
	source: string;
	object: SgNode;
	pair: string;
}): Edit => {
	const closing = object.range().end.index - 1;
	const multiline = source
		.slice(object.range().start.index, closing)
		.includes("\n");
	const members = object.children().filter(isMember);
	const last = members[members.length - 1];
	if (last === undefined) {
		return multiline
			? {
					startPos: lineStartOf(source, closing),
					endPos: lineStartOf(source, closing),
					insertedText: `${leadingIndentOfLine(source, object.range().start.index)}\t${pair},\n`,
				}
			: {
					startPos: object.range().start.index + 1,
					endPos: closing,
					insertedText: ` ${pair} `,
				};
	}
	const lastEnd = last.range().end.index;
	const between = source.slice(lastEnd, closing);
	const trailingComma = between.trimStart().startsWith(",");
	const afterComma = trailingComma
		? lastEnd + between.indexOf(",") + 1
		: lastEnd;
	if (multiline) {
		// Anchored to the last member itself, so a value whose closing brace shares
		// the object's closing line can never push the insert outside the literal.
		const indent = leadingIndentOfLine(source, last.range().start.index);
		return {
			startPos: afterComma,
			endPos: afterComma,
			insertedText: trailingComma
				? `\n${indent}${pair},`
				: `,\n${indent}${pair},`,
		};
	}
	return {
		startPos: afterComma,
		endPos: afterComma,
		insertedText: trailingComma ? ` ${pair},` : `, ${pair}`,
	};
};

/** Whether a literal is built from a spread, so an inserted pair has to go last. */
export const holdsSpread = ({ object }: { object: SgNode }): boolean =>
	object.children().some((child) => child.kind() === "spread_element");
