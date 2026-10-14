import { Terminal, useTerminal } from "@wterm/react";
import "@wterm/react/css";
import { useEffect, useRef, useState } from "react";

const toCrlf = (s: string): string => s.replace(/\r?\n/g, "\r\n");

export function TerminalOutput({ text }: { text: string }) {
	const { ref, write } = useTerminal();
	const written = useRef("");
	const [ready, setReady] = useState(false);

	useEffect(() => {
		if (!ready || text === written.current) {
			return;
		}
		if (text.startsWith(written.current)) {
			write(toCrlf(text.slice(written.current.length)));
		} else {
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
			onData={() => {
			}}
			onReady={() => setReady(true)}
			ref={ref}
		/>
	);
}
