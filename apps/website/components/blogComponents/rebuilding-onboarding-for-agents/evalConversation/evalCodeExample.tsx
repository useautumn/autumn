import {
	Children,
	type CSSProperties,
	cloneElement,
	isValidElement,
	type ReactNode,
} from "react";

type CodeElementProps = {
	children?: ReactNode;
	style?: CSSProperties;
	"data-line"?: string;
};

function firstText(children: ReactNode): string {
	const first = Children.toArray(children)[0];
	if (typeof first === "string") return first;
	if (isValidElement<CodeElementProps>(first)) {
		return firstText(first.props.children);
	}
	return "";
}

function indentWrappedLines(children: ReactNode): ReactNode {
	return Children.map(children, (child) => {
		if (!isValidElement<CodeElementProps>(child)) return child;
		if (child.props["data-line"] !== undefined) {
			const indentation =
				firstText(child.props.children).match(/^\s*/)?.[0].length ?? 0;
			const style = {
				...child.props.style,
				"--code-indent": `${indentation + 2}ch`,
			} as CSSProperties;
			return cloneElement(child, { style });
		}
		return cloneElement(child, {
			children: indentWrappedLines(child.props.children),
		});
	});
}

export function EvalCodeExample({ children }: { children: ReactNode }) {
	return (
		<div className="eval-code-example">{indentWrappedLines(children)}</div>
	);
}
