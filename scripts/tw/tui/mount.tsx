/** @jsxImportSource @opentui/react */

import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import { setLogSubscriber, sinkLine } from "../helpers/logSink.ts";
import { App } from "./App.tsx";
import { appendLog } from "./store.ts";

type Renderer = Awaited<ReturnType<typeof createCliRenderer>>;
type Root = ReturnType<typeof createRoot>;

let renderer: Renderer | undefined;
let root: Root | undefined;

const CONSOLE_METHODS = ["log", "info", "warn", "error", "debug"] as const;
type ConsoleMethod = (typeof CONSOLE_METHODS)[number];
const savedConsole: Partial<
	Record<ConsoleMethod, (...args: unknown[]) => void>
> = {};

const formatConsoleArgs = (args: unknown[]): string =>
	args
		.map((arg) => {
			if (typeof arg === "string") {
				return arg;
			}
			if (arg instanceof Error) {
				return arg.stack ?? arg.message;
			}
			try {
				return JSON.stringify(arg);
			} catch {
				return String(arg);
			}
		})
		.join(" ");

const redirectConsole = (): void => {
	for (const method of CONSOLE_METHODS) {
		savedConsole[method] = console[method] as (...args: unknown[]) => void;
		console[method] = (...args: unknown[]): void => {
			sinkLine(formatConsoleArgs(args));
		};
	}
};

const restoreConsole = (): void => {
	for (const method of CONSOLE_METHODS) {
		const original = savedConsole[method];
		if (original) {
			console[method] = original as typeof console.log;
		}
		delete savedConsole[method];
	}
};

export const canUseTui = (): boolean => Boolean(process.stdout.isTTY);

export const mountTui = async (): Promise<void> => {
	if (renderer) {
		return;
	}
	renderer = await createCliRenderer({
		exitOnCtrlC: false,
		exitSignals: [],
		targetFps: 30,
		consoleMode: "disabled",
		openConsoleOnError: false,
	});
	root = createRoot(renderer);
	root.render(<App />);
	setLogSubscriber(appendLog);
	redirectConsole();
};

export const unmountTui = (): void => {
	restoreConsole();
	setLogSubscriber(undefined);
	try {
		renderer?.destroy();
	} catch {}
	renderer = undefined;
	root = undefined;
};
