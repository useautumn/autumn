import * as fs from "node:fs";
import * as path from "node:path";

// tsup emits every type declaration twice (.d.ts for require, .d.mts for
// import). This keeps one real copy; a "pointer" is a one-line re-export of it.
const packageDir = path.resolve(import.meta.dirname, "..");
const distDir = path.join(packageDir, "dist");

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));

// Derived from the tsconfig that produces the type tree, so renaming the output
// dir or the workspace package can't strand this script on a stale path.
const standaloneCompilerOptions = readJson(
	path.join(packageDir, "tsconfig.standalone.json"),
).compilerOptions;
const sdkTypesDir = path.resolve(packageDir, standaloneCompilerOptions.outDir);
const sdkTypesEntry = path.join(sdkTypesDir, "index.js");
const workspaceSdkName = readJson(
	path.resolve(
		packageDir,
		standaloneCompilerOptions.rootDir,
		"../package.json",
	),
).name;

// tsc emits the type tree with relative imports and no .d.mts twins, so every
// pass below would no-op across its ~200 files.
const sdkTypesTopLevelDir = path.relative(distDir, sdkTypesDir);

const listDeclarationFiles = () =>
	fs
		.readdirSync(distDir, { recursive: true })
		.map((entry) => entry.toString())
		.filter((entry) => entry.split(/[\\/]/)[0] !== sdkTypesTopLevelDir)
		.filter((entry) => /\.d\.(ts|mts)$/.test(entry))
		.map((entry) => path.join(distDir, entry));

const toRelativeImportSpecifier = ({ fromFile, toFile }) => {
	const relative = path
		.relative(path.dirname(fromFile), toFile)
		.replaceAll("\\", "/");
	return relative.startsWith(".") ? relative : `./${relative}`;
};

// The dts rollup keeps the workspace SDK imports external (see tsup.config.ts);
// consumers can't resolve that workspace name, so point them at the type tree.
const rewriteWorkspaceSdkImports = (declarationFiles) => {
	let rewrittenCount = 0;
	for (const file of declarationFiles) {
		const content = fs.readFileSync(file, "utf8");
		if (!content.includes(workspaceSdkName)) continue;
		const specifier = toRelativeImportSpecifier({
			fromFile: file,
			toFile: sdkTypesEntry,
		});
		fs.writeFileSync(
			file,
			content
				.replaceAll(`"${workspaceSdkName}"`, `"${specifier}"`)
				.replaceAll(`'${workspaceSdkName}'`, `'${specifier}'`),
		);
		rewrittenCount++;
	}
	return rewrittenCount;
};

const cjsTwinOf = (esmDeclarationFile) =>
	`${esmDeclarationFile.slice(0, -".d.mts".length)}.d.ts`;

const hasDefaultExport = (declarationText) =>
	/\bexport default\b|\bas default\b/.test(declarationText);

// Paired .d.mts files duplicate their .d.ts twin byte-for-byte (modulo chunk
// extensions). `export *` skips default exports, so those are forwarded explicitly.
const replaceDuplicateEsmDeclarationsWithPointers = (declarationFiles) => {
	const duplicates = declarationFiles.filter(
		(file) => file.endsWith(".d.mts") && fs.existsSync(cjsTwinOf(file)),
	);
	for (const file of duplicates) {
		const twinBaseName = path.basename(file).slice(0, -".d.mts".length);
		const pointer = `export * from "./${twinBaseName}.js";\n`;
		const defaultForward = hasDefaultExport(
			fs.readFileSync(cjsTwinOf(file), "utf8"),
		)
			? `export { default } from "./${twinBaseName}.js";\n`
			: "";
		fs.writeFileSync(file, pointer + defaultForward);
	}
	return duplicates.length;
};

// An ESM-only declaration chunk (its hash differs from the CJS twin's) loses
// its last importer once every paired .d.mts above becomes a pointer.
const deleteUnreferencedEsmDeclarationChunks = (declarationFiles) => {
	const allDeclarationText = declarationFiles
		.map((file) => fs.readFileSync(file, "utf8"))
		.join("\n");
	const orphans = declarationFiles.filter((file) => {
		if (!file.endsWith(".d.mts")) return false;
		if (fs.existsSync(cjsTwinOf(file))) return false;
		const chunkName = path.basename(file).slice(0, -".d.mts".length);
		return !allDeclarationText.includes(chunkName);
	});
	for (const file of orphans) {
		fs.unlinkSync(file);
	}
	return orphans.length;
};

const declarationFiles = listDeclarationFiles();
const rewrittenCount = rewriteWorkspaceSdkImports(declarationFiles);
const pointerCount =
	replaceDuplicateEsmDeclarationsWithPointers(declarationFiles);
const deletedCount = deleteUnreferencedEsmDeclarationChunks(declarationFiles);
console.log(
	`dedupe-dts: rewrote ${rewrittenCount} ${workspaceSdkName} imports, replaced ${pointerCount} duplicate .d.mts files with pointers, deleted ${deletedCount} unreferenced declaration chunks`,
);
