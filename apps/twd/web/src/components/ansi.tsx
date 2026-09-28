import type { CSSProperties } from "react";
import { cn } from "../lib/format.ts";

type Style = {
	fg?: string;
	bold?: boolean;
	dim?: boolean;
	italic?: boolean;
	underline?: boolean;
};
type Span = { text: string; style: Style };

const COLORS: Record<number, string> = {
	30: "var(--faint)",
	31: "var(--bad)",
	32: "var(--ok)",
	33: "var(--warn)",
	34: "var(--info)",
	35: "#b877db",
	36: "#3ea8b8",
	37: "var(--fg)",
	90: "var(--faint)",
	91: "var(--bad)",
	92: "var(--ok)",
	93: "var(--warn)",
	94: "var(--info)",
	95: "#c792ea",
	96: "#56c3d3",
	97: "var(--fg)",
};

const applyCodes = (style: Style, codes: number[]): Style => {
	let next = { ...style };
	for (const code of codes.length ? codes : [0]) {
		if (code === 0) next = {};
		else if (code === 1) next.bold = true;
		else if (code === 2) next.dim = true;
		else if (code === 3) next.italic = true;
		else if (code === 4) next.underline = true;
		else if (code === 22) next = { ...next, bold: false, dim: false };
		else if (code === 39) next.fg = undefined;
		else if (COLORS[code]) next.fg = COLORS[code];
	}
	return next;
};

const SGR = new RegExp(`${String.fromCharCode(27)}\\[([\\d;]*)([A-Za-z])`, "g");

export const parseAnsi = (input: string): Span[] => {
	const spans: Span[] = [];
	let style: Style = {};
	let last = 0;
	for (const m of input.matchAll(SGR)) {
		if (m.index > last) spans.push({ text: input.slice(last, m.index), style });
		if (m[2] === "m")
			style = applyCodes(style, m[1] ? m[1].split(";").map(Number) : []);
		last = m.index + m[0].length;
	}
	if (last < input.length) spans.push({ text: input.slice(last), style });
	return spans;
};

const css = (s: Style): CSSProperties => ({
	color: s.fg,
	fontWeight: s.bold ? 600 : undefined,
	opacity: s.dim ? 0.6 : undefined,
	fontStyle: s.italic ? "italic" : undefined,
	textDecoration: s.underline ? "underline" : undefined,
});

export const AnsiText = ({ text }: { text: string }) => (
	<>
		{parseAnsi(text).map((span, i) => (
			<span key={`${i}-${span.text.length}`} style={css(span.style)}>
				{span.text}
			</span>
		))}
	</>
);

export const AnsiLog = ({
	text,
	className,
}: {
	text: string;
	className?: string;
}) => (
	<pre
		className={cn(
			"font-mono text-[12px] leading-[1.6] whitespace-pre-wrap break-words text-fg",
			className,
		)}
	>
		<AnsiText text={text} />
	</pre>
);
