import * as Bun from "bun";

const packageJson = await Bun.file("./package.json").json();
const version: string = packageJson.version;

console.time(`Building atmn-nightly v${version}`);
const result = await Bun.build({
	entrypoints: ["./src/cli.ts"],
	outdir: "./dist",
	format: "esm",
	target: "node",
	define: { VERSION: `"${version}"` },
});
console.timeEnd(`Building atmn-nightly v${version}`);

if (!result.success) {
	for (const log of result.logs) console.error(log);
	process.exit(1);
}
