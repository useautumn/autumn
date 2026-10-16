import {
	cpSync,
	existsSync,
	lstatSync,
	mkdirSync,
	readdirSync,
	realpathSync,
	symlinkSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";
import type { ExternalImport } from "./bundleEntry.ts";

const STORE_SEGMENT = "/node_modules/.bun/";

/** "@scope/pkg/sub" → "@scope/pkg"; "pkg/sub" → "pkg". */
const packageNameOf = (specifier: string) =>
	specifier
		.split("/")
		.slice(0, specifier.startsWith("@") ? 2 : 1)
		.join("/");

/** The bun store entry (".bun/<entry>") holding a resolved file. */
const storeEntryOf = (resolvedPath: string) => {
	const afterStore = resolvedPath.split(STORE_SEGMENT)[1];
	if (!afterStore) throw new Error(`${resolvedPath} is not in the bun store`);
	return afterStore.split("/")[0];
};

/** Resolves every external package exactly as its importer did, refusing two versions of one name. */
export const resolveExternalEntries = ({
	imports,
}: {
	imports: ExternalImport[];
}): Map<string, string> => {
	const entryByName = new Map<string, string>();
	for (const { specifier, importer } of imports) {
		const name = packageNameOf(specifier);
		const resolved = realpathSync(
			Bun.resolveSync(specifier, dirname(importer)),
		);
		const entry = storeEntryOf(resolved);
		const existing = entryByName.get(name);
		if (existing && existing !== entry) {
			throw new Error(
				`${name} resolves to both ${existing} and ${entry}; one top-level copy can't serve both`,
			);
		}
		entryByName.set(name, entry);
	}
	return entryByName;
};

/** Store entries a package's own node_modules links to. */
const linkedEntries = ({
	storeDir,
	entry,
}: {
	storeDir: string;
	entry: string;
}) => {
	const modulesDir = join(storeDir, entry, "node_modules");
	const links: string[] = [];
	const visit = (dir: string) => {
		for (const child of readdirSync(dir)) {
			const path = join(dir, child);
			if (child.startsWith("@") && lstatSync(path).isDirectory()) visit(path);
			else if (lstatSync(path).isSymbolicLink())
				links.push(storeEntryOf(realpathSync(path)));
		}
	};
	visit(modulesDir);
	return links;
};

/** Copies each external package's store entry and everything it links to, then links it at the top level. */
export const copyExternalPackages = ({
	repoRoot,
	outDir,
	entryByName,
}: {
	repoRoot: string;
	outDir: string;
	entryByName: Map<string, string>;
}) => {
	const storeDir = join(repoRoot, "node_modules", ".bun");
	const outStoreDir = join(outDir, "node_modules", ".bun");

	const copied = new Set<string>();
	const pending = [...entryByName.values()];
	while (pending.length > 0) {
		const entry = pending.pop() as string;
		if (copied.has(entry)) continue;
		copied.add(entry);
		cpSync(join(storeDir, entry), join(outStoreDir, entry), {
			recursive: true,
			verbatimSymlinks: true,
		});
		pending.push(...linkedEntries({ storeDir, entry }));
	}

	for (const [name, entry] of entryByName) {
		const link = join(outDir, "node_modules", name);
		const target = join(outStoreDir, entry, "node_modules", name);
		if (!existsSync(target))
			throw new Error(`${name} is missing from ${entry}`);
		mkdirSync(dirname(link), { recursive: true });
		symlinkSync(relative(dirname(link), target), link);
	}

	return { copiedEntries: copied.size };
};
