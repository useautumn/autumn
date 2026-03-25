import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { CaretDownIcon, TerminalWindowIcon } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTerminalStore } from "@/hooks/stores/useTerminalStore";
import { cn } from "@/lib/utils";

const PS1 = "atmn> ";
const MIN_HEIGHT = 120;
const MAX_HEIGHT = 600;
const DEFAULT_HEIGHT = 280;

const HELP_TEXT = `
Available commands:

  help          Show this help message
  login         Authenticate with Autumn
  logout        Remove Autumn API keys
  env           Check environment and org info
  init          Initialize an Autumn project
  push          Push changes to Autumn
  pull          Pull changes from Autumn
  nuke          Permanently nuke your sandbox
  customers     Browse and inspect customers
  products      Browse and inspect products/plans
  features      Browse and inspect features
  events        Browse and inspect usage events
  preview       Preview plans from autumn.config.ts
  config        Get and set global configuration
  dashboard     Open the Autumn dashboard
  version       Show the CLI version
  clear         Clear the terminal

Run "npx atmn <command> --help" for more info on a command.
`;

/** Resolves a CSS variable to its computed hex/rgb value */
function getCSSVar(name: string): string {
	return getComputedStyle(document.documentElement)
		.getPropertyValue(name)
		.trim();
}

/** Build an xterm theme from the app's CSS variables */
function getTermTheme(): Record<string, string> {
	return {
		background: getCSSVar("--background"),
		foreground: getCSSVar("--foreground"),
		cursor: getCSSVar("--foreground"),
		cursorAccent: getCSSVar("--background"),
		selectionBackground: getCSSVar("--muted"),
	};
}

export function TerminalShell() {
	const open = useTerminalStore((s) => s.open);
	const closeTerminal = useTerminalStore((s) => s.closeTerminal);

	const [height, setHeight] = useState(DEFAULT_HEIGHT);
	const isDraggingRef = useRef(false);
	const dragStartYRef = useRef(0);
	const dragStartHeightRef = useRef(0);

	const termRef = useRef<HTMLDivElement>(null);
	const xtermRef = useRef<Terminal | null>(null);
	const fitAddonRef = useRef<FitAddon | null>(null);
	const lineBufferRef = useRef("");
	const mountedRef = useRef(false);

	// Drag-to-resize handlers
	const handleDragStart = useCallback(
		(e: React.MouseEvent) => {
			e.preventDefault();
			isDraggingRef.current = true;
			dragStartYRef.current = e.clientY;
			dragStartHeightRef.current = height;

			const handleMouseMove = (ev: MouseEvent) => {
				if (!isDraggingRef.current) return;
				// Dragging up = negative delta = bigger panel
				const delta = dragStartYRef.current - ev.clientY;
				const next = Math.min(
					MAX_HEIGHT,
					Math.max(MIN_HEIGHT, dragStartHeightRef.current + delta),
				);
				setHeight(next);
			};

			const handleMouseUp = () => {
				isDraggingRef.current = false;
				document.removeEventListener("mousemove", handleMouseMove);
				document.removeEventListener("mouseup", handleMouseUp);
				document.body.style.cursor = "";
				document.body.style.userSelect = "";
				// Refit xterm after drag ends
				requestAnimationFrame(() => {
					fitAddonRef.current?.fit();
				});
			};

			document.body.style.cursor = "row-resize";
			document.body.style.userSelect = "none";
			document.addEventListener("mousemove", handleMouseMove);
			document.addEventListener("mouseup", handleMouseUp);
		},
		[height],
	);

	const writePrompt = useCallback((term: Terminal) => {
		term.write(`\r\n\x1b[36m${PS1}\x1b[0m`);
	}, []);

	const handleCommand = useCallback(
		({ term, raw }: { term: Terminal; raw: string }) => {
			const cmd = raw.trim();

			if (!cmd) {
				writePrompt(term);
				return;
			}

			if (cmd === "clear") {
				term.clear();
				term.write(`\x1b[36m${PS1}\x1b[0m`);
				return;
			}

			if (cmd === "help") {
				term.write(HELP_TEXT.replace(/\n/g, "\r\n"));
				writePrompt(term);
				return;
			}

			// All other commands: show a message about running via npx
			const knownCommands = [
				"login",
				"logout",
				"env",
				"init",
				"push",
				"pull",
				"nuke",
				"customers",
				"products",
				"plans",
				"features",
				"events",
				"preview",
				"config",
				"dashboard",
				"version",
				"v",
			];

			if (knownCommands.includes(cmd.split(" ")[0])) {
				term.write(
					`\r\n\x1b[33mRun this in your terminal:\x1b[0m npx atmn ${cmd}`,
				);
				writePrompt(term);
				return;
			}

			term.write(
				`\r\n\x1b[31mUnknown command:\x1b[0m ${cmd}\r\nType \x1b[36mhelp\x1b[0m for available commands.`,
			);
			writePrompt(term);
		},
		[writePrompt],
	);

	// Initialize terminal once
	useEffect(() => {
		if (!open || mountedRef.current || !termRef.current) return;

		const term = new Terminal({
			cursorBlink: true,
			fontSize: 13,
			fontFamily: "'SF Mono', 'Fira Code', 'Cascadia Code', monospace",
			lineHeight: 1.4,
			theme: getTermTheme(),
			allowTransparency: true,
			scrollback: 1000,
			convertEol: true,
			cursorStyle: "bar",
			cursorWidth: 2,
		});

		const fitAddon = new FitAddon();
		term.loadAddon(fitAddon);

		term.open(termRef.current);

		// Short delay to let the container render before fitting
		requestAnimationFrame(() => {
			fitAddon.fit();
		});

		term.write(
			`\x1b[2mAutumn CLI Shell — type \x1b[36mhelp\x1b[2m for commands\x1b[0m`,
		);
		writePrompt(term);

		term.onData((data) => {
			const code = data.charCodeAt(0);

			// Enter
			if (code === 13) {
				const raw = lineBufferRef.current;
				lineBufferRef.current = "";
				handleCommand({ term, raw });
				return;
			}

			// Backspace / Delete
			if (code === 127) {
				if (lineBufferRef.current.length > 0) {
					lineBufferRef.current = lineBufferRef.current.slice(0, -1);
					term.write("\b \b");
				}
				return;
			}

			// Ctrl+C
			if (code === 3) {
				lineBufferRef.current = "";
				term.write("^C");
				writePrompt(term);
				return;
			}

			// Ctrl+L (clear)
			if (code === 12) {
				lineBufferRef.current = "";
				term.clear();
				term.write(`\x1b[36m${PS1}\x1b[0m`);
				return;
			}

			// Ignore other control chars
			if (code < 32) return;

			// Regular character
			lineBufferRef.current += data;
			term.write(data);
		});

		xtermRef.current = term;
		fitAddonRef.current = fitAddon;
		mountedRef.current = true;

		return () => {
			term.dispose();
			xtermRef.current = null;
			fitAddonRef.current = null;
			mountedRef.current = false;
		};
	}, [open, writePrompt, handleCommand]);

	// Refit on open/resize/height change
	useEffect(() => {
		if (!open || !fitAddonRef.current) return;

		const handleResize = () => {
			requestAnimationFrame(() => {
				fitAddonRef.current?.fit();
			});
		};

		// Fit after the animation completes
		const timeout = setTimeout(handleResize, 350);
		window.addEventListener("resize", handleResize);

		return () => {
			clearTimeout(timeout);
			window.removeEventListener("resize", handleResize);
		};
	}, [open]);

	// Focus terminal when opened
	useEffect(() => {
		if (open && xtermRef.current) {
			setTimeout(() => {
				xtermRef.current?.focus();
			}, 350);
		}
	}, [open]);

	// Update theme when it changes (observe class changes on <html>)
	useEffect(() => {
		if (!xtermRef.current) return;

		const observer = new MutationObserver(() => {
			if (xtermRef.current) {
				xtermRef.current.options.theme = getTermTheme();
			}
		});

		observer.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ["class"],
		});

		return () => observer.disconnect();
	}, [open]);

	return (
		<AnimatePresence>
			{open && (
				<motion.div
					initial={{ height: 0, opacity: 0 }}
					animate={{ height, opacity: 1 }}
					exit={{ height: 0, opacity: 0 }}
					transition={{
						type: "spring",
						stiffness: 400,
						damping: 35,
						mass: 0.8,
					}}
					className="w-full overflow-hidden border-t border-border/40 bg-background flex flex-col"
				>
					{/* Resize handle */}
					<div
						onMouseDown={handleDragStart}
						className={cn(
							"w-full h-1.5 cursor-row-resize shrink-0 group flex items-center justify-center",
							"hover:bg-muted/60 active:bg-muted transition-colors",
						)}
					>
						<div className="w-8 h-0.5 rounded-full bg-border group-hover:bg-foreground/30 transition-colors" />
					</div>

					{/* Header bar */}
					<div className="flex items-center justify-between px-3 h-8 border-b border-border/40 bg-card shrink-0">
						<div className="flex items-center gap-2 text-t3 text-xs">
							<TerminalWindowIcon className="size-3.5" />
							<span>Terminal</span>
						</div>
						<button
							type="button"
							onClick={closeTerminal}
							className={cn(
								"flex items-center justify-center size-6 rounded-md",
								"text-t3 hover:text-foreground hover:bg-muted transition-colors",
							)}
						>
							<CaretDownIcon className="size-3.5" />
						</button>
					</div>

					{/* Terminal content */}
					<div ref={termRef} className="w-full flex-1 min-h-0 px-2 py-1" />
				</motion.div>
			)}
		</AnimatePresence>
	);
}
