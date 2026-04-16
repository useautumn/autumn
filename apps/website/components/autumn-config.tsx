"use client";

import Image from "next/image";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Light as RawSyntaxHighlighter } from "react-syntax-highlighter";
import js from "react-syntax-highlighter/dist/esm/languages/hljs/javascript";

const SyntaxHighlighter = RawSyntaxHighlighter as unknown as ((props: {
	children: string;
	customStyle?: Record<string, string | number>;
	language: string;
	lineNumberStyle?: Record<string, string | number>;
	showLineNumbers?: boolean;
	style?: Record<string, Record<string, string | number>>;
}) => JSX.Element) & {
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

const TOTAL_LINES = 16;
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
			className="@container w-full max-w-[520px] border border-[#2A2A2A] bg-[#000000]/90"
		>
			{/* Title bar */}
			{/* <div className="flex items-center justify-between border-b border-[#2A2A2A] px-4 py-0.5 gap-3 w-full">
        <div className="flex-1 min-w-0 overflow-hidden flex justify-end items-center h-[21px]">
          <Image
            src="/images/hero/box.svg"
            width={186}
            height={21}
            alt="Box"
            style={{ width: "auto", height: "auto" }}
            className="max-w-none w-[186px] h-[21px] object-none object-right shrink-0"
          />
        </div>
        <span className="font-mono text-[17.5px] text-[#FFFFFF99] whitespace-nowrap pt-0.5 shrink-0 mx-1">
          autumn.config.ts
        </span>
        <div className="flex-1 min-w-0 overflow-hidden flex justify-start items-center h-[21px]">
          <Image
            src="/images/hero/box.svg"
            width={186}
            height={21}
            alt="Box"
            style={{ width: "auto", height: "auto" }}
            className="w-[186px] h-[21px] object-none object-left"
          />
        </div>
        <span className="ml-1 border border-[#292929] cursor-pointer select-none flex items-center justify-center shrink-0 p-1.5">
          <img
            src="/images/hero/cross.svg"
            width={11}
            height={11}
            alt="cross"
          />
        </span>
      </div> */}
			<div className="flex items-center justify-between border-b border-[#292929] px-2 py-1.5  w-full bg-[#000000]">
				{/* Left Vent: flex-1 makes it stretch, min-w-0 allows it to shrink below its content if needed */}
				<div className="flex-1 min-w-[10px] h-[22px] border border-[#292929] flex flex-col justify-evenly px-[2px]">
					<div className="h-[1px] w-full bg-[#2A2A2A]/60" />
					<div className="h-[1px] w-full bg-[#2A2A2A]/60" />
					<div className="h-[1px] w-full bg-[#2A2A2A]/60" />
				</div>

				{/* Filename: shrink-0 ensures the text never gets squashed */}
				<span className="font-mono text-[18px] text-[#FFFFFF99] whitespace-nowrap shrink-0 px-2">
					billing.ts
				</span>

				{/* Right Vent: Matches the left one */}
				<div className="flex-1 min-w-[10px] h-[22px] border border-[#2A2A2A] flex flex-col justify-evenly px-[2px]">
					<div className="h-[1px] w-full bg-[#2A2A2A]/60" />
					<div className="h-[1px] w-full bg-[#2A2A2A]/60" />
					<div className="h-[1px] w-full bg-[#2A2A2A]/60" />
				</div>

				{/* Close Button Container */}
				<div className="w-[24px] ml-2 h-[24px] border border-[#2A2A2A] flex items-center justify-center shrink-0 cursor-pointer hover:bg-white/5 transition-colors">
					<Image
						src="/images/hero/cross.svg"
						width={11}
						height={11}
						alt="Box"
						style={{ width: "auto", height: "auto" }}
						className="w-full h-[11px] object-fill object-left"
					/>
				</div>
			</div>

			{/* Code area — fluidly driven by container query relative font sizes so height never distorts */}
			<div className="relative px-4 py-3 font-mono text-sm overflow-hidden">
				{/* Dynamic-height inner box: 20 lines × 1.25em */}
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
						className="absolute -top-3.5 left-14 w-0.5 h-3.5 bg-[#9564ff]"
						style={{
							opacity: cursorVisible ? 1 : 0,
							transition: "opacity 0.1s",
						}}
					/>
				</div>

				<div className="pointer-events-none absolute bottom-0 left-0 right-0 h-28 bg-linear-to-t from-[#000000] via-[#000000]/70 to-transparent z-10" />

				<div className="px-1 sm:px-2">
					<div className="absolute left-2 right-2 sm:left-3 sm:right-3 bottom-[10px] flex items-center justify-between border border-[#9564ff] bg-[#20143C] px-2 sm:px-4 py-2 sm:py-2.5 font-mono text-[10px] sm:text-sm shadow-[0_4px_20px_rgba(149,100,255,0.1)] z-20">
						<div className="flex items-center gap-1 sm:gap-2">
							<span className="text-[#959494]">allowed:</span>
							<span className="text-[#2B8C3F]">true</span>
							<span className="text-[#959494] ml-0.5 sm:ml-0">remaining:</span>
							<span className="text-[#9564ff]">8976</span>
						</div>
						<span className="text-[#9564ff] ml-1">92ms</span>
					</div>
				</div>
			</div>
		</div>
	);
}
