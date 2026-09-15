"use client";

import type React from "react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import AgentPromptPane, { AgentMarks } from "./build-with-agents";
import { Light as RawSyntaxHighlighter } from "react-syntax-highlighter";
import js from "react-syntax-highlighter/dist/esm/languages/hljs/javascript";

const SyntaxHighlighter = RawSyntaxHighlighter as unknown as ((props: {
	children: string;
	customStyle?: Record<string, string | number>;
	language: string;
	lineNumberStyle?: Record<string, string | number>;
	showLineNumbers?: boolean;
	style?: Record<string, Record<string, string | number>>;
}) => React.JSX.Element) & {
	registerLanguage: (name: string, language: unknown) => void;
};

// useLayoutEffect runs synchronously before browser paint on the client,
// eliminating the container-query font-size race that causes CLS on reload.
const useIsomorphicLayoutEffect =
	typeof window !== "undefined" ? useLayoutEffect : useEffect;

SyntaxHighlighter.registerLanguage("javascript", js);

const autumnTheme = {
	hljs: {
		display: "block",
		background: "transparent",
		color: "#BFBFBF",
		padding: "0",
		margin: "0",
	},
	"hljs-comment": { color: "#6B6B6B" },
	"hljs-keyword": { color: "#9564ff" },
	"hljs-built_in": { color: "#BFBFBF" },
	"hljs-string": { color: "#2B8C3F" },
	"hljs-number": { color: "#9564ff" },
	"hljs-literal": { color: "#2B8C3F" },
	"hljs-attr": { color: "#FF1F12" },
	"hljs-property": { color: "#FF1F12" },
	"hljs-variable": { color: "#0161B5" },
	"hljs-title": { color: "#BFBFBF" },
	"hljs-params": { color: "#0161B5" },
	"hljs-punctuation": { color: "#BFBFBF" },
};

const LINE_HEIGHT = 22;
const TYPESCRIPT_ICON_PATH =
	"M1.125 0C.502 0 0 .502 0 1.125v21.75C0 23.498.502 24 1.125 24h21.75c.623 0 1.125-.502 1.125-1.125V1.125C24 .502 23.498 0 22.875 0zm17.363 9.75c.612 0 1.154.037 1.627.111a6.38 6.38 0 0 1 1.306.34v2.458a3.95 3.95 0 0 0-.643-.361 5.093 5.093 0 0 0-.717-.26 5.453 5.453 0 0 0-1.426-.2c-.3 0-.573.028-.819.086a2.1 2.1 0 0 0-.623.242c-.17.104-.3.229-.393.374a.888.888 0 0 0-.14.49c0 .196.053.373.156.529.104.156.252.304.443.444s.423.276.696.41c.273.135.582.274.926.416.47.197.892.407 1.266.628.374.222.695.473.963.753.268.279.472.598.614.957.142.359.214.776.214 1.253 0 .657-.125 1.21-.373 1.656a3.033 3.033 0 0 1-1.012 1.085 4.38 4.38 0 0 1-1.487.596c-.566.12-1.163.18-1.79.18a9.916 9.916 0 0 1-1.84-.164 5.544 5.544 0 0 1-1.512-.493v-2.63a5.033 5.033 0 0 0 3.237 1.2c.333 0 .624-.03.872-.09.249-.06.456-.144.623-.25.166-.108.29-.234.373-.38a1.023 1.023 0 0 0-.074-1.089 2.12 2.12 0 0 0-.537-.5 5.597 5.597 0 0 0-.807-.444 27.72 27.72 0 0 0-1.007-.436c-.918-.383-1.602-.852-2.053-1.405-.45-.553-.676-1.222-.676-2.005 0-.614.123-1.141.369-1.582.246-.441.58-.804 1.004-1.089a4.494 4.494 0 0 1 1.47-.629 7.536 7.536 0 0 1 1.77-.201zm-15.113.188h9.563v2.166H9.506v9.646H6.789v-9.646H3.375z";

const codeContent = `// Your entire billing integration
const { allowed } = await check({
	featureId: "ai_tokens"
});

if (allowed) {
  await track({
    featureId: "ai_tokens",
    value: 1024
  });
}`;

const TOTAL_LINES = codeContent.split("\n").length;
const TYPING_SPEED = 10;

export default function AutumnConfig({
	lines = TOTAL_LINES,
	initialDelay = 0,
	awaitEvent = null,
}: {
	awaitEvent?: string | null;
	initialDelay?: number;
	lines?: number;
}) {
	const fullCode = (() => {
		const lineCount = codeContent.split("\n").length;
		return codeContent + "\n".repeat(Math.max(0, lines - lineCount));
	})();
	const containerRef = useRef<HTMLDivElement | null>(null);
	const [fontSize, setFontSize] = useState(16);
	const [displayed, setDisplayed] = useState("");
	const [awaitDone, setAwaitDone] = useState(!awaitEvent);
	const [started, setStarted] = useState(initialDelay === 0 && !awaitEvent);
	const done = displayed.length >= fullCode.length;

	// Wait for the signal event before starting the delay countdown
	useEffect(() => {
		if (!awaitEvent) return;
		const handler = () => setAwaitDone(true);
		window.addEventListener(awaitEvent, handler, { once: true });
		return () => window.removeEventListener(awaitEvent, handler);
	}, [awaitEvent]);

	// Start typing after awaitDone, respecting initialDelay
	useEffect(() => {
		if (!awaitDone) return;
		const t = setTimeout(() => setStarted(true), initialDelay);
		return () => clearTimeout(t);
	}, [awaitDone, initialDelay]);

	useIsomorphicLayoutEffect(() => {
		const el = containerRef.current;
		if (!el) return;
		const measure = () =>
			setFontSize(Math.min(Math.max(el.offsetWidth * 0.032, 10), 16));
		measure();
		const ro = new ResizeObserver(measure);
		ro.observe(el);
		return () => ro.disconnect();
	}, []);

	const displayedPadded =
		displayed + "\n".repeat(Math.max(0, lines - displayed.split("\n").length));
	useEffect(() => {
		if (!started || done) return;
		const timer = setTimeout(() => {
			setDisplayed(fullCode.slice(0, displayed.length + 1));
		}, TYPING_SPEED);
		return () => clearTimeout(timer);
	}, [displayed, done, started, fullCode]);

	return (
		<div
			ref={containerRef}
			className="@container w-full max-w-[520px] flex flex-col border border-[#2A2A2A] bg-[#000000]/90"
		>
			<div className="flex items-center justify-between border-b border-[#2A2A2A] px-4 py-2.5">
				<span className="font-mono uppercase tracking-[-2%] text-[11px] leading-none text-[#FFFFFF66]">
					Build with agents
				</span>
				<AgentMarks className="h-3 w-3" />
			</div>

			<div className="flex flex-col gap-3 p-3">
				<div className="border border-[#2A2A2A] bg-[#0A0A0A]">
					<div className="flex items-center gap-2 border-b border-[#2A2A2A] px-3 py-2 font-mono text-[12px] leading-none text-[#FFFFFF99]">
						<svg
							viewBox="0 0 24 24"
							xmlns="http://www.w3.org/2000/svg"
							role="img"
							className="h-3 w-3 shrink-0"
						>
							<title>TypeScript</title>
							<path d={TYPESCRIPT_ICON_PATH} fill="currentColor" />
						</svg>
						<span className="leading-none">billing.ts</span>
					</div>

					<div className="relative px-3 py-3 font-mono text-sm overflow-hidden">
						<div
							style={{
								height: `${lines * LINE_HEIGHT}px`,
								overflow: "hidden",
								fontSize: `${fontSize}px`,
							}}
						>
							<SyntaxHighlighter
								language="javascript"
								style={autumnTheme}
								showLineNumbers
								lineNumberStyle={{
									color: "#fff",
									minWidth: "2rem",
									paddingRight: "1rem",
									userSelect: "none",
								}}
								customStyle={{
									background: "transparent",
									padding: 0,
									margin: 0,
									fontSize: "inherit",
									lineHeight: `${LINE_HEIGHT}px`,
									fontWeight: "300",
									overflow: "hidden",
								}}
							>
								{displayedPadded}
							</SyntaxHighlighter>
						</div>
					</div>
				</div>

				<div className="flex items-center justify-between border border-[#9564ff] bg-[#20143C] px-3 py-2 font-mono text-[12px] shadow-[0_4px_20px_rgba(149,100,255,0.1)]">
					<div className="flex items-center gap-2">
						<span className="text-[#959494]">allowed:</span>
						<span className="text-[#2B8C3F]">true</span>
						<span className="text-[#959494]">remaining:</span>
						<span className="text-[#9564ff]">8976</span>
					</div>
					<span className="text-[#9564ff]">92ms</span>
				</div>
			</div>

			<AgentPromptPane active={started} />
		</div>
	);
}
