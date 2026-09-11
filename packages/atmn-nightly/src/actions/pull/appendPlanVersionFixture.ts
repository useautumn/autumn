import { dirname, relative, resolve } from "node:path";
import { Lang, parse } from "@ast-grep/napi";
import { appendToBinding } from "../../surgery/appendToBinding";
import { appendToCollection } from "../../surgery/appendToCollection";
import { ensureBuilderImport } from "../../surgery/ensureBuilderImport";
import { lineStartOf } from "../../surgery/fixtureEdit";
import type { CollectionTarget } from "./resolveCollectionTarget";

const NAMED_IMPORT = /import\s+\{([^}]*)\}\s*from\s*["']([^"']+)["']/;

const importSpecifierForBuilder = ({
	source,
	builder,
}: {
	source: string;
	builder: string;
}): string | null => {
	const root = parse(Lang.TypeScript, source).root();
	for (const statement of root.findAll({
		rule: { kind: "import_statement" },
	})) {
		const match = NAMED_IMPORT.exec(statement.text());
		if (match === null) continue;
		const importsBuilder = match[1].split(",").some((entry) => {
			const [imported] = entry.trim().split(/\s+as\s+/);
			return imported === builder;
		});
		if (importsBuilder) return match[2];
	}
	return null;
};

const referenceSpecifier = ({
	from,
	fixtureFile,
}: {
	from: string;
	fixtureFile: string;
}): string => {
	const path = relative(dirname(from), fixtureFile)
		.replaceAll("\\", "/")
		.replace(/\.ts$/, "");
	return path.startsWith(".") ? path : `./${path}`;
};

const builderSpecifierForFixture = ({
	configPath,
	fixtureFile,
	specifier,
}: {
	configPath: string;
	fixtureFile: string;
	specifier: string;
}): string =>
	specifier.startsWith(".")
		? referenceSpecifier({
				from: fixtureFile,
				fixtureFile: resolve(dirname(configPath), specifier),
			})
		: specifier;

const ensureReferenceImport = ({
	source,
	name,
	specifier,
}: {
	source: string;
	name: string;
	specifier: string;
}): string => {
	const root = parse(Lang.TypeScript, source).root();
	for (const statement of root.findAll({
		rule: { kind: "import_statement" },
	})) {
		const match = NAMED_IMPORT.exec(statement.text());
		if (match === null || match[2] !== specifier) continue;
		const names = match[1]
			.split(",")
			.map((entry) => entry.trim())
			.filter(Boolean);
		if (names.includes(name)) return source;
		if (match[1].includes("\n")) break;
		const updated = statement
			.text()
			.replace(`{${match[1]}}`, `{ ${[...names, name].join(", ")} }`);
		return root.commitEdits([
			{
				startPos: statement.range().start.index,
				endPos: statement.range().end.index,
				insertedText: updated,
			},
		]);
	}
	return `import { ${name} } from "${specifier}";\n${source}`;
};

const addExport = ({
	source,
	declaration,
	beforeBinding,
}: {
	source: string;
	declaration: string;
	beforeBinding?: string;
}): string => {
	if (beforeBinding === undefined)
		return `${source.trimEnd()}${source.trim() === "" ? "" : "\n\n"}${declaration}\n`;

	const root = parse(Lang.TypeScript, source).root();
	const declarator = root
		.findAll({ rule: { kind: "variable_declarator" } })
		.find((node) => node.field("name")?.text() === beforeBinding);
	if (declarator === undefined)
		return `${source.trimEnd()}\n\n${declaration}\n`;
	let statement = declarator;
	while (
		statement.parent() !== null &&
		statement.parent()?.kind() !== "program"
	)
		statement = statement.parent() ?? statement;
	const insertAt = lineStartOf(source, statement.range().start.index);
	return `${source.slice(0, insertAt)}${declaration}\n\n${source.slice(insertAt)}`;
};

export const planVersionExportName = ({
	planId,
	versionSlug,
	takenSources = [],
}: {
	planId: string;
	versionSlug: string;
	takenSources?: string[];
}): string => {
	const raw = `${planId}_${versionSlug}`;
	const sanitized = raw.replace(/[^A-Za-z0-9]/g, "_");
	const preferred = /^[A-Za-z_]/.test(sanitized) ? sanitized : `_${sanitized}`;
	if (!takenSources.some((source) => declaresName({ source, name: preferred })))
		return preferred;

	const encoded = raw.replace(
		/[^A-Za-z0-9]/gu,
		(character) => `_${character.codePointAt(0)?.toString(16)}_`,
	);
	const fallback = /^[A-Za-z_]/.test(encoded) ? encoded : `_${encoded}`;
	let available = fallback;
	let suffix = 2;
	while (
		takenSources.some((source) => declaresName({ source, name: available }))
	) {
		available = `${fallback}_${suffix}`;
		suffix += 1;
	}
	return available;
};

const declaresName = ({
	source,
	name,
}: {
	source: string;
	name: string;
}): boolean => {
	const root = parse(Lang.TypeScript, source).root();
	const variable = root
		.findAll({ rule: { kind: "variable_declarator" } })
		.some((node) => node.field("name")?.text() === name);
	if (variable) return true;
	return root.findAll({ rule: { kind: "import_specifier" } }).some((node) => {
		const names = node
			.text()
			.trim()
			.split(/\s+as\s+/);
		return names[names.length - 1] === name;
	});
};

export const appendPlanVersionFixture = ({
	configPath,
	files,
	target,
	fixtureFile,
	planId,
	versionSlug,
	fixture,
	builder,
	targetCollection,
	builderCollection,
}: {
	configPath: string;
	files: Map<string, string>;
	target: CollectionTarget;
	fixtureFile: string;
	planId: string;
	versionSlug: string;
	fixture: string;
	builder: string;
	targetCollection: string;
	builderCollection: string;
}): boolean => {
	const configSource = files.get(configPath) ?? "";
	const originalFixtureSource = files.get(fixtureFile);
	const targetSourceBefore = files.get(target.file) ?? "";
	const exportName = planVersionExportName({
		planId,
		versionSlug,
		takenSources: [targetSourceBefore, originalFixtureSource ?? ""],
	});
	const builderSpecifier = importSpecifierForBuilder({
		source: configSource,
		builder,
	});
	const seededFixtureSource =
		originalFixtureSource ??
		(builderSpecifier === null
			? ""
			: `import { ${builder} } from "${builderSpecifierForFixture({ configPath, fixtureFile, specifier: builderSpecifier })}";\n`);
	const withExport = addExport({
		source: seededFixtureSource,
		declaration: `export const ${exportName} = ${fixture};`,
		...(target.file === fixtureFile && target.kind === "binding"
			? { beforeBinding: target.name }
			: {}),
	});
	const fixtureSource = ensureBuilderImport({
		source: withExport,
		builder,
		collection: builderCollection,
	});
	const targetSource =
		target.file === fixtureFile
			? fixtureSource
			: (files.get(target.file) ?? "");
	const withReference =
		target.kind === "inline"
			? appendToCollection({
					source: targetSource,
					collection: targetCollection,
					text: exportName,
				})
			: appendToBinding({
					source: targetSource,
					name: target.name,
					text: exportName,
				});
	if (withReference === null) return false;

	files.set(
		fixtureFile,
		target.file === fixtureFile ? withReference : fixtureSource,
	);
	if (target.file !== fixtureFile) {
		files.set(
			target.file,
			ensureReferenceImport({
				source: withReference,
				name: exportName,
				specifier: referenceSpecifier({
					from: target.file,
					fixtureFile,
				}),
			}),
		);
	}
	return true;
};
