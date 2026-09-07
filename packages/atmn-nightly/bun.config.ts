import * as Bun from "bun";

const packageJson = await Bun.file("./package.json").json();
const version: string = packageJson.version;
// Dependencies stay external: npm installs them per platform (ast-grep ships
// a native binary per OS, which must never be baked into one tarball).
const external = Object.keys(packageJson.dependencies ?? {});

console.time(`Building atmn-nightly v${version}`);
const result = await Bun.build({
	entrypoints: ["./src/bin.ts", "./src/index.ts"],
	outdir: "./dist",
	format: "esm",
	target: "node",
	define: { VERSION: `"${version}"` },
	external,
});
console.timeEnd(`Building atmn-nightly v${version}`);

if (!result.success) {
	for (const log of result.logs) console.error(log);
	process.exit(1);
}
