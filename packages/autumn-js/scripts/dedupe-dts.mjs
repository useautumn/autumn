import * as fs from "node:fs";
import * as path from "node:path";

// tsup emits every type declaration twice (.d.ts for require, .d.mts for
// import). This keeps one real copy; a "pointer" is a one-line re-export of it.
const distDir = path.resolve(import.meta.dirname, "../dist");
const sdkTypesEntry = path.join(distDir, "sdk-types", "index.js");

// sdk-types is the canonical type tree, standalone is runtime-only, and sdk's
// declarations are replaced whole — none of them need per-file processing.
const untouchedTopLevelDirs = new Set(["sdk-types", "standalone", "sdk"]);

const listDeclarationFiles = () =>
	fs
		.readdirSync(distDir, { recursive: true })
		.map((entry) => entry.toString())
		.filter((entry) => !untouchedTopLevelDirs.has(entry.split(/[\\/]/)[0]))
		.filter((entry) => /\.d\.(ts|mts)$/.test(entry))
		.map((entry) => path.join(distDir, entry));

// The root export is a pure `export * from "@useautumn/sdk"`, so its
// declarations can point at the tsc-emitted tree instead of a 2 MB rollup.
const pointRootDeclarationsAtSdkTypesTree = () => {
	const pointer = 'export * from "../sdk-types/index.js";\n';
	fs.mkdirSync(path.join(distDir, "sdk"), { recursive: true });
	fs.writeFileSync(path.join(distDir, "sdk", "index.d.ts"), pointer);
	fs.writeFileSync(path.join(distDir, "sdk", "index.d.mts"), pointer);
};

const toRelativeImportSpecifier = ({ fromFile, toFile }) => {
	const relative = path
		.relative(path.dirname(fromFile), toFile)
		.replaceAll("\\", "/");
	return relative.startsWith(".") ? relative : `./${relative}`;
};

// The dts rollup keeps "@useautumn/sdk" imports external (see tsup.config.ts);
// consumers can't resolve that workspace name, so point them at dist/sdk-types.
const rewriteWorkspaceSdkImports = (declarationFiles) => {
	let rewrittenCount = 0;
	for (const file of declarationFiles) {
		const content = fs.readFileSync(file, "utf8");
		if (!content.includes("@useautumn/sdk")) continue;
		const specifier = toRelativeImportSpecifier({
			fromFile: file,
			toFile: sdkTypesEntry,
		});
		fs.writeFileSync(
			file,
			content
				.replaceAll('"@useautumn/sdk"', `"${specifier}"`)
				.replaceAll("'@useautumn/sdk'", `'${specifier}'`),
		);
		rewrittenCount++;
	}
	return rewrittenCount;
};

const cjsTwinOf = (esmDeclarationFile) =>
	`${esmDeclarationFile.slice(0, -".d.mts".length)}.d.ts`;

// Paired .d.mts files duplicate their .d.ts twin byte-for-byte (modulo chunk
// extensions). No entry has a default export, so `export *` is lossless.
const replaceDuplicateEsmDeclarationsWithPointers = (declarationFiles) => {
	const duplicates = declarationFiles.filter(
		(file) => file.endsWith(".d.mts") && fs.existsSync(cjsTwinOf(file)),
	);
	for (const file of duplicates) {
		const twinBaseName = path.basename(file).slice(0, -".d.mts".length);
		fs.writeFileSync(file, `export * from "./${twinBaseName}.js";\n`);
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
pointRootDeclarationsAtSdkTypesTree();
const rewrittenCount = rewriteWorkspaceSdkImports(declarationFiles);
const pointerCount =
	replaceDuplicateEsmDeclarationsWithPointers(declarationFiles);
const deletedCount = deleteUnreferencedEsmDeclarationChunks(declarationFiles);
console.log(
	`dedupe-dts: pointed root declarations at sdk-types, rewrote ${rewrittenCount} SDK imports, replaced ${pointerCount} duplicate .d.mts files with pointers, deleted ${deletedCount} unreferenced declaration chunks`,
);
