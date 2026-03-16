import * as Bun from "bun";

async function getVersion(): Promise<string> {
	const packageJson = await Bun.file("./package.json").json();
	return packageJson.version;
}

async function build() {
	const version = await getVersion();

	// Build everything with Bun
	console.time(`Building atmn v${version}`);
	await Bun.build({
		entrypoints: ["./src/cli.tsx", "./src/compose/index.ts"],
		outdir: "./dist",
		format: "esm",
		target: "node",
		define: {
			VERSION: `"${version}"`,
		},
		external: ["prettier", "jiti"],
	});
	console.timeEnd(`Building atmn v${version}`);

	// Generate TypeScript declarations with tsc
	console.time(`Generating type declarations`);
	const tsc = Bun.spawn(["tsc", "--project", "tsconfig.build.json"], {
		stdio: ["inherit", "inherit", "inherit"],
	});
	await tsc.exited;
	console.timeEnd(`Generating type declarations`);
}

build();
