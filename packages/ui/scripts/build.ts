import { statSync } from "node:fs";
import { rm } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";

const packageDir = resolve(import.meta.dir, "..");
const srcDir = join(packageDir, "src");
const distDir = join(packageDir, "dist");
const selfImport = "@autumn/ui/";
const sourceExtensions = [".ts", ".tsx", "/index.ts", "/index.tsx"];

const isFile = (path: string) =>
	statSync(path, { throwIfNoEntry: false })?.isFile() ?? false;

const resolveSourceFile = (base: string) => {
	const file = [base, ...sourceExtensions.map((ext) => base + ext)].find(
		isFile,
	);
	if (!file) throw new Error(`Cannot resolve ${base}`);
	return file;
};

const toRelativeImport = ({ from, to }: { from: string; to: string }) => {
	const path = relative(dirname(from), to);
	return path.startsWith(".") ? path : `./${path}`;
};

// One output file per source file: internal imports stay external, so consumers tree-shake per module.
const buildModules = async () => {
	const entrypoints = [...new Bun.Glob("**/*.{ts,tsx}").scanSync(srcDir)]
		.filter((file) => !file.endsWith(".d.ts"))
		.map((file) => join(srcDir, file));

	const result = await Bun.build({
		entrypoints,
		root: srcDir,
		outdir: distDir,
		format: "esm",
		target: "browser",
		packages: "external",
		jsx: { development: false },
		minify: { whitespace: true, syntax: true },
		plugins: [
			{
				name: "preserve-modules",
				setup: (build) => {
					build.onResolve(
						{ filter: /^(@autumn\/ui\/|\.)/ },
						({ path, importer }) => {
							const base = path.startsWith(selfImport)
								? join(srcDir, path.slice(selfImport.length))
								: resolve(dirname(importer), path);
							const target = resolveSourceFile(base).replace(/\.tsx?$/, ".js");
							return {
								path: toRelativeImport({ from: importer, to: target }),
								external: true,
							};
						},
					);
				},
			},
		],
	});
	if (!result.success)
		throw new AggregateError(result.logs, "bun build failed");
	await restoreUseClientDirectives({ entrypoints });
	return result.outputs.length;
};

// Bun drops module directives; Next needs "use client" on each client module.
const restoreUseClientDirectives = async ({
	entrypoints,
}: {
	entrypoints: string[];
}) => {
	for (const entrypoint of entrypoints) {
		const source = await Bun.file(entrypoint).text();
		if (
			!/^(?:\s|\/\/[^\n]*\n|\/\*[\s\S]*?\*\/)*["']use client["']/.test(source)
		)
			continue;
		const output = join(distDir, relative(srcDir, entrypoint)).replace(
			/\.tsx?$/,
			".js",
		);
		await Bun.write(output, `"use client";${await Bun.file(output).text()}`);
	}
};

const buildDeclarations = async () => {
	const tsgo = Bun.spawn(["tsgo", "-p", "tsconfig.build.json"], {
		cwd: packageDir,
		stdout: "inherit",
		stderr: "inherit",
	});
	if ((await tsgo.exited) !== 0) throw new Error("Declaration build failed");
};

// tsc keeps path aliases verbatim, so self-imports would only resolve for consumers that alias @autumn/ui.
const rewriteDeclarationSelfImports = async () => {
	for (const file of new Bun.Glob("**/*.d.ts").scanSync(distDir)) {
		const path = join(distDir, file);
		const text = await Bun.file(path).text();
		if (!text.includes(selfImport)) continue;
		const rewritten = text.replace(
			/(["'])@autumn\/ui\/([^"']+)\1/g,
			(_, quote: string, target: string) => {
				const declaration = resolveSourceFile(join(srcDir, target))
					.replace(srcDir, distDir)
					.replace(/\.tsx?$/, ".js");
				return `${quote}${toRelativeImport({ from: path, to: declaration })}${quote}`;
			},
		);
		await Bun.write(path, rewritten);
	}
};

const startedAt = performance.now();
await rm(distDir, { recursive: true, force: true });
const moduleCount = await buildModules();
await buildDeclarations();
await rewriteDeclarationSelfImports();
console.log(
	`Built ${moduleCount} modules with declarations in ${Math.round(performance.now() - startedAt)}ms`,
);
