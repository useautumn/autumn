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

const LINE_HEIGHT = 24;

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
	const [cursorVisible, setCursorVisible] = useState(true);
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
			setFontSize(Math.min(Math.max(el.offsetWidth * 0.0385, 10), 20));
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

	// Blinking cursor after done
	useEffect(() => {
		if (!done) return;
		const interval = setInterval(() => setCursorVisible((v) => !v), 530);
		return () => clearInterval(interval);
	}, [done]);

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
						<span aria-hidden="true" className="text-[#9564ff]">
							&#9633;
						</span>
						billing.ts
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

						<div style={{ height: 0, overflow: "visible", position: "relative" }}>
							<span
								className="absolute -top-3.5 left-12 w-0.5 h-3.5 bg-[#9564ff]"
								style={{
									opacity: cursorVisible ? 1 : 0,
									transition: "opacity 0.1s",
								}}
							/>
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
