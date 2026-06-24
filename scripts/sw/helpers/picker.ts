// Zero-dependency single-select picker (arrow keys + enter). Kept dependency-free
// on purpose so the CLI has no TUI install to drift — it renders with raw ANSI.

export type PickerOption<T extends string> = {
	value: T;
	label: string;
	hint?: string;
};

const ESC = "\x1b";
const HIDE_CURSOR = `${ESC}[?25l`;
const SHOW_CURSOR = `${ESC}[?25h`;

function render<T extends string>(
	title: string,
	options: PickerOption<T>[],
	active: number,
	firstPaint: boolean,
): void {
	const lines: string[] = [];
	if (!firstPaint) {
		// Move cursor up over the previously painted block to repaint in place.
		lines.push(`${ESC}[${options.length + 1}A`);
	}
	lines.push(`${ESC}[2K${title}`);
	for (let i = 0; i < options.length; i++) {
		const option = options[i];
		const selected = i === active;
		const pointer = selected ? `${ESC}[36m❯${ESC}[0m` : " ";
		const label = selected
			? `${ESC}[36m${option.label}${ESC}[0m`
			: option.label;
		const hint = option.hint ? ` ${ESC}[90m${option.hint}${ESC}[0m` : "";
		lines.push(`${ESC}[2K ${pointer} ${label}${hint}`);
	}
	process.stdout.write(`${lines.join("\n")}\n`);
}

/**
 * Prompt the user to choose one option. Resolves to the chosen value, or null if
 * cancelled (q / Ctrl-C / Esc). Falls back to the env override when stdin is not a
 * TTY (e.g. CI / piped), so the picker never hangs a non-interactive run.
 */
export function pick<T extends string>({
	title,
	options,
	envOverride,
}: {
	title: string;
	options: PickerOption<T>[];
	envOverride?: string;
}): Promise<T | null> {
	const override = envOverride ? process.env[envOverride]?.trim() : undefined;
	if (override) {
		const match = options.find((option) => option.value === override);
		if (match) return Promise.resolve(match.value);
	}
	const stdin = process.stdin;
	if (!stdin.isTTY) {
		return Promise.resolve(options[0]?.value ?? null);
	}

	return new Promise<T | null>((resolve) => {
		let active = 0;
		let firstPaint = true;
		stdin.setRawMode(true);
		stdin.resume();
		stdin.setEncoding("utf8");
		process.stdout.write(HIDE_CURSOR);
		render(title, options, active, firstPaint);
		firstPaint = false;

		const cleanup = () => {
			stdin.setRawMode(false);
			stdin.pause();
			stdin.removeListener("data", onData);
			process.stdout.write(SHOW_CURSOR);
		};

		const onData = (key: string) => {
			if (key === "\x03" || key === "q" || key === ESC) {
				cleanup();
				resolve(null);
				return;
			}
			if (key === "\r" || key === "\n") {
				cleanup();
				resolve(options[active].value);
				return;
			}
			if (key === "\x1b[A" || key === "k") {
				active = (active - 1 + options.length) % options.length;
			} else if (key === "\x1b[B" || key === "j") {
				active = (active + 1) % options.length;
			} else {
				return;
			}
			render(title, options, active, firstPaint);
		};

		stdin.on("data", onData);
	});
}
