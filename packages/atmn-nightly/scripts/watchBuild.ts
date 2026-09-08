import { watch } from "node:fs";
import { join } from "node:path";

const PACKAGE_DIR = join(import.meta.dirname, "..");
const SETTLE_MS = 150;

const build = async (): Promise<void> => {
	const started = Date.now();
	const proc = Bun.spawn(["bun", "run", "bun.config.ts"], {
		cwd: PACKAGE_DIR,
		stdout: "inherit",
		stderr: "inherit",
	});
	const code = await proc.exited;
	const took = Date.now() - started;
	console.log(
		code === 0
			? `[atmn-nightly] built in ${took}ms`
			: `[atmn-nightly] build failed (${code})`,
	);
};

// Edits arrive in bursts (save-all, formatters); one build per burst.
let timer: ReturnType<typeof setTimeout> | undefined;
const scheduleBuild = (): void => {
	clearTimeout(timer);
	timer = setTimeout(() => void build(), SETTLE_MS);
};

await build();
watch(join(PACKAGE_DIR, "src"), { recursive: true }, scheduleBuild);
watch(join(PACKAGE_DIR, "package.json"), scheduleBuild);
console.log("[atmn-nightly] watching src/ — dist rebuilds on change");
