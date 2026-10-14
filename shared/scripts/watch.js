import { spawn } from "node:child_process";
import { watch } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = resolve(dirname(fileURLToPath(import.meta.url)), "..");

let isBuilding = false;
let rebuildQueued = false;

function runBuild() {
	if (isBuilding) {
		rebuildQueued = true;
		return;
	}

	isBuilding = true;
	console.log("\n📦 [shared] Rebuilding...");

	const build = spawn(
		"bun",
		[
			"build",
			"./index.ts",
			"--outdir",
			"dist",
			"--format",
			"esm",
			"--target",
			"bun",
			"--external",
			"zod",
		],
		{
			cwd: __dirname,
			stdio: "inherit",
			shell: true,
		},
	);

	const tsc = spawn("tsc", ["--emitDeclarationOnly", "--outDir", "dist"], {
		cwd: __dirname,
		stdio: "inherit",
		shell: true,
	});

	Promise.all([
		new Promise((resolve) => build.on("close", resolve)),
		new Promise((resolve) => tsc.on("close", resolve)),
	]).then(() => {
		console.log("✅ [shared] Rebuild complete");
		isBuilding = false;

		if (rebuildQueued) {
			rebuildQueued = false;
			setTimeout(() => runBuild(), 100);
		}
	});
}

const watcher = watch(__dirname, { recursive: true }, (eventType, filename) => {
	if (
		!filename ||
		filename.includes("dist/") ||
		filename.includes("node_modules/") ||
		filename.includes("scripts/") ||
		!filename.endsWith(".ts")
	) {
		return;
	}

	console.log(`\n📝 [shared] Changed: ${filename}`);
	runBuild();
});

console.log("👀 [shared] Watching for changes...");

process.on("SIGINT", () => {
	watcher.close();
	process.exit(0);
});

process.on("SIGTERM", () => {
	watcher.close();
	process.exit(0);
});
