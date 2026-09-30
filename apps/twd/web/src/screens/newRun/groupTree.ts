import type { Catalog } from "../../../../src/api/contract.ts";

type Group = Catalog["groups"][number];

export type GroupTree = {
	roots: Group[];
	children: Map<string, Group[]>;
	/** Files of a group not covered by any of its child groups. */
	looseFiles: Map<string, string[]>;
};

const isStrictSubset = (a: Set<string>, b: Set<string>) =>
	a.size < b.size && [...a].every((f) => b.has(f));

/** Nests each group under its smallest same-tier strict superset, so composed groups read as a tree. */
export const buildGroupTree = (catalog: Catalog): GroupTree => {
	const filesOf = new Map<string, Set<string>>(
		catalog.groups.map((g) => [g.name, new Set()]),
	);
	for (const f of catalog.files)
		for (const g of f.groups) filesOf.get(g)?.add(f.path);
	const files = (name: string) => filesOf.get(name) ?? new Set<string>();

	const parentOf = (g: Group) =>
		catalog.groups
			.filter(
				(h) =>
					h.tier === g.tier && isStrictSubset(files(g.name), files(h.name)),
			)
			.sort(
				(a, b) =>
					files(a.name).size - files(b.name).size ||
					a.name.localeCompare(b.name),
			)[0];

	const roots: Group[] = [];
	const children = new Map<string, Group[]>();
	for (const g of catalog.groups) {
		const parent = parentOf(g);
		if (!parent) roots.push(g);
		else children.set(parent.name, [...(children.get(parent.name) ?? []), g]);
	}

	const looseFiles = new Map<string, string[]>();
	for (const g of catalog.groups) {
		const covered = new Set(
			(children.get(g.name) ?? []).flatMap((c) => [...files(c.name)]),
		);
		looseFiles.set(
			g.name,
			[...files(g.name)].filter((f) => !covered.has(f)),
		);
	}
	return { roots, children, looseFiles };
};
