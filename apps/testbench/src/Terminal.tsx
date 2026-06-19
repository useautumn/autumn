import { Terminal, useTerminal } from "@wterm/react";
import "@wterm/react/css";
import { useEffect, useRef } from "react";

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
export function TerminalOutput({ text }: { text: string }) {
	const { ref, write } = useTerminal();
	const written = useRef("");

	useEffect(() => {
		if (text === written.current) {
			return;
		}
		if (text.startsWith(written.current)) {
			write(text.slice(written.current.length));
		} else {
			// Subscription switched (or buffer replaced) — hard reset the emulator.
			write("\u001bc");
			write(text);
		}
		written.current = text;
	}, [text, write]);

	return (
		<Terminal
			autoResize
			className="size-full"
			cursorBlink={false}
			// Read-only: discard every keystroke; no shell is attached.
			onData={() => {
				/* read-only */
			}}
			ref={ref}
		/>
	);
}
