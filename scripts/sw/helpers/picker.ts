import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline/promises";

export type PickerOption<T extends string> = {
	value: T;
	label: string;
	hint?: string;
};

/**
 * Plain numbered prompt — print `[1] [2] …`, read a line, parse it. No raw mode
 * (raw-mode arrow pickers fight the terminal/p10k and trap the cursor). Resolves
 * to the chosen value, or null if cancelled / not a TTY without an override.
 */
export async function pick<T extends string>({
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
		if (match) return match.value;
	}
	if (!stdin.isTTY) return null;

	console.log(title);
	for (const [index, option] of options.entries()) {
		const hint = option.hint ? `  ${option.hint}` : "";
		console.log(`  [${index + 1}] ${option.label}${hint}`);
	}

	const rl = createInterface({ input: stdin, output: stdout });
	try {
		for (let attempt = 0; attempt < 5; attempt++) {
			const answer = (
				await rl.question(`type 1-${options.length} (q to cancel) › `)
			)
				.trim()
				.toLowerCase();
			if (answer === "" || answer === "q") return null;
			const choice = Number(answer);
			if (Number.isInteger(choice) && choice >= 1 && choice <= options.length) {
				return options[choice - 1].value;
			}
			const byName = options.find((option) => option.value === answer);
			if (byName) return byName.value;
			console.log(`  please enter a number 1-${options.length}`);
		}
		return null;
	} finally {
		rl.close();
	}
}
