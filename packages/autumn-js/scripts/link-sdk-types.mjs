import * as fs from "node:fs";
import * as path from "node:path";

const packageDir = path.resolve(import.meta.dirname, "..");
const distDir = path.join(packageDir, "dist");

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));

// Derived from the tsconfig that emits the type tree, so renaming its output
// dir or the workspace package can't strand this script on a stale path.
const { outDir, rootDir } = readJson(
	path.join(packageDir, "tsconfig.standalone.json"),
).compilerOptions;
const sdkTypesDir = path.resolve(packageDir, outDir);
const sdkTypesEntry = path.join(sdkTypesDir, "index.js");
const workspaceSdkName = readJson(
	path.resolve(packageDir, rootDir, "../package.json"),
).name;

// tsc already emits the type tree with relative imports; only tsup's rolled-up
// declarations need a pass.
const listRolledUpDeclarations = () => {
	const sdkTypesTopLevelDir = path.relative(distDir, sdkTypesDir);
	return fs
		.readdirSync(distDir, { recursive: true })
		.map((entry) => entry.toString())
		.filter((entry) => entry.split(/[\\/]/)[0] !== sdkTypesTopLevelDir)
		.filter((entry) => /\.d\.(ts|mts)$/.test(entry))
		.map((entry) => path.join(distDir, entry));
};

// package.json resolves every subpath through a single "types" key pointing at
// the .d.ts, so the .d.mts twins tsup emits beside them are never read.
const deleteUnreadEsmDeclarations = (declarations) => {
	const unread = declarations.filter((file) => file.endsWith(".d.mts"));
	for (const file of unread) {
		fs.unlinkSync(file);
	}
	return unread.length;
};

// The dts rollup keeps the workspace SDK external (see tsup.config.ts) so its
// types aren't re-inlined per entry, but consumers can't resolve that name.
const repointWorkspaceSdkImports = (declarations) => {
	let repointed = 0;
	for (const file of declarations) {
		const content = fs.readFileSync(file, "utf8");
		if (!content.includes(workspaceSdkName)) continue;
		const relative = path
			.relative(path.dirname(file), sdkTypesEntry)
			.replaceAll("\\", "/");
		const specifier = relative.startsWith(".") ? relative : `./${relative}`;
		fs.writeFileSync(
			file,
			content
				.replaceAll(`"${workspaceSdkName}"`, `"${specifier}"`)
				.replaceAll(`'${workspaceSdkName}'`, `'${specifier}'`),
		);
		repointed++;
	}
	return repointed;
};

const declarations = listRolledUpDeclarations();
const deletedCount = deleteUnreadEsmDeclarations(declarations);
const repointedCount = repointWorkspaceSdkImports(
	declarations.filter((file) => file.endsWith(".d.ts")),
);
console.log(
	`link-sdk-types: deleted ${deletedCount} unread .d.mts files, repointed ${workspaceSdkName} in ${repointedCount} declarations`,
);
