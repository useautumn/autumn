import { watch } from "node:fs";

let building = false;

async function rebuild() {
	if (building) return;
	building = true;

	console.log("\n🔄 Rebuilding...");
	const start = Date.now();

	try {
		await Bun.$`bun run bun.config.ts`;
		const duration = Date.now() - start;
		console.log(`✅ Build complete in ${duration}ms\n`);
	} catch (error) {
		console.error("❌ Build failed:", error);
	} finally {
		building = false;
	}
}

await rebuild();

const watcher1 = watch("./src", { recursive: true }, (_event, filename) => {
	if (filename?.match(/\.(ts|tsx)$/)) {
		console.log(`📝 Changed: src/${filename}`);
		rebuild();
	}
});

const watcher2 = watch("./source", { recursive: true }, (_event, filename) => {
	if (filename?.match(/\.(ts|tsx)$/)) {
		console.log(`📝 Changed: source/${filename}`);
		rebuild();
	}
});

console.log("👀 Watching for changes in src/ and source/...");
console.log("Press Ctrl+C to stop\n");

process.on("SIGINT", () => {
	console.log("\n👋 Stopping watcher...");
	watcher1.close();
	watcher2.close();
	process.exit(0);
});
