import { Terminal, useTerminal } from "@wterm/react";
import "@wterm/react/css";
import { useEffect, useRef, useState } from "react";

/**
 * Read-only terminal surface (WTERM). Renders raw test/server output WITH its
 * ANSI escape codes interpreted as real colors — no raw `[32m…` garbage like a
 * `whitespace-pre` div produced.
 *
 * "Read-only" = we never attach a shell and we swallow `onData`, so there is no
 * PS1 prompt and keystrokes do nothing; it is purely a display surface fed by
 * `write()`.
 *
 * The WS layer hands us `text` as a monotonically growing buffer for the active
 * subscription, and swaps to a fresh buffer (often shorter) when the user picks
 * a different file/worker. We diff against what we've already written: an append
 * streams just the delta; anything else is a full reset (`\x1bc`) + rewrite.
 */
/**
 * Normalize newlines to CRLF for the VT emulator. The captured output uses bare
 * `\n` (Unix LF); to a real terminal that's line-feed ONLY — move down, keep the
 * column — which produces the "staircase" where each line drifts right. WTERM
 * needs `\r\n` to also return the carriage to column 0. Collapsing `\r?\n → \r\n`
 * makes LF and existing CRLF consistent (a stray double-CR across a chunk
 * boundary is harmless — it just re-homes an already-homed cursor).
 */
const toCrlf = (s: string): string => s.replace(/\r?\n/g, "\r\n");

export function TerminalOutput({ text }: { text: string }) {
	const { ref, write } = useTerminal();
	const written = useRef("");
	// WTERM drops write() until its async WASM init completes — writing before
	// onReady silently loses the initial buffer, so hold all writes until then.
	const [ready, setReady] = useState(false);

	useEffect(() => {
		if (!ready || text === written.current) {
			return;
		}
		if (text.startsWith(written.current)) {
			write(toCrlf(text.slice(written.current.length)));
		} else {
			// Subscription switched (or buffer replaced) — hard reset the emulator.
			write("\u001bc");
			write(toCrlf(text));
		}
		written.current = text;
	}, [text, write, ready]);

	return (
		<Terminal
			autoResize
			className="size-full"
			cursorBlink={false}
			// Read-only: discard every keystroke; no shell is attached.
			onData={() => {
				/* read-only */
			}}
			onReady={() => setReady(true)}
			ref={ref}
		/>
	);
}
