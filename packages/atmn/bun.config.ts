import * as Bun from "bun";

const packageJson = await Bun.file("./package.json").json();
const version: string = packageJson.version;
const external = Object.keys(packageJson.dependencies ?? {});

console.time(`Building atmn v${version}`);
const result = await Bun.build({
	entrypoints: ["./src/bin.ts", "./src/index.ts"],
	outdir: "./dist",
	format: "esm",
	target: "node",
	define: { VERSION: `"${version}"` },
	external,
});
console.timeEnd(`Building atmn v${version}`);

if (!result.success) {
	for (const log of result.logs) console.error(log);
	process.exit(1);
}
