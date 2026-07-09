import { useEffect, useMemo, useRef } from "react";

/**
 * No-wrap log pane for the ANSI-lite errors feed: long lines scroll
 * horizontally instead of soft-wrapping like the wterm emulator does.
 */

const ESCAPE = String.fromCharCode(27);
const SGR_RE = new RegExp(`${ESCAPE}\\[([0-9;]*)m`, "g");

const COLOR_CLASS: Record<string, string> = {
	"31": "text-red-500",
	"32": "text-green-500",
	"33": "text-yellow-500",
	"36": "text-cyan-500",
	"90": "text-muted-foreground",
};

type Segment = { start: number; text: string; className?: string };

const parseAnsi = (text: string): Segment[] => {
	const segments: Segment[] = [];
	let last = 0;
	let current: string | undefined;
	for (const match of text.matchAll(SGR_RE)) {
		if (match.index > last) {
			segments.push({
				start: last,
				text: text.slice(last, match.index),
				className: current,
			});
		}
		for (const code of (match[1] || "0").split(";")) {
			if (code === "" || code === "0") {
				current = undefined;
			} else {
				current = COLOR_CLASS[code] ?? current;
			}
		}
		last = match.index + match[0].length;
	}
	if (last < text.length) {
		segments.push({ start: last, text: text.slice(last), className: current });
	}
	return segments;
};

const PIN_THRESHOLD_PX = 24;

export function AnsiLog({ text }: { text: string }) {
	const ref = useRef<HTMLPreElement>(null);
	// Follow the tail only while the user hasn't scrolled up.
	const pinned = useRef(true);
	const segments = useMemo(() => parseAnsi(text), [text]);

	// No dependency array: re-pin after every commit (renders only when text changes).
	useEffect(() => {
		const el = ref.current;
		if (el && pinned.current) {
			el.scrollTop = el.scrollHeight;
		}
	});

	return (
		<pre
			className="size-full overflow-auto whitespace-pre p-3 font-mono text-foreground text-xs leading-5"
			onScroll={(event) => {
				const el = event.currentTarget;
				pinned.current =
					el.scrollHeight - el.scrollTop - el.clientHeight < PIN_THRESHOLD_PX;
			}}
			ref={ref}
		>
			{segments.map((segment) =>
				segment.className ? (
					<span className={segment.className} key={segment.start}>
						{segment.text}
					</span>
				) : (
					<span key={segment.start}>{segment.text}</span>
				),
			)}
		</pre>
	);
}
