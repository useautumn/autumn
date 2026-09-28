import { useState } from "react";
import type { z } from "zod";
import type { Catalog, TestFile } from "../../../../src/api/contract.ts";

type File = z.infer<typeof TestFile>;

export type Selection = { groups: string[]; files: string[]; grep: string };

/** Group ↔ file selection state; a file unchecked out of a group splits that group into files. */
export const useRunSelection = ({
	catalog,
}: {
	catalog: Catalog | undefined;
}) => {
	const [selection, setSelection] = useState<Selection>({
		groups: [],
		files: [],
		grep: "",
	});

	const filesOf = (group: string) =>
		catalog?.files.filter((f) => f.groups.includes(group)).map((f) => f.path) ??
		[];

	const selectedSet = (() => {
		const set = new Set(selection.files);
		for (const g of selection.groups) for (const f of filesOf(g)) set.add(f);
		return set;
	})();

	const grep = selection.grep.trim();
	const effective = [...selectedSet].filter((f) => !grep || f.includes(grep));

	const groupState = (group: string) => {
		if (selection.groups.includes(group)) return "checked" as const;
		const files = filesOf(group);
		const hit = files.filter((f) => selectedSet.has(f)).length;
		if (hit === 0) return "unchecked" as const;
		return hit === files.length ? ("checked" as const) : ("partial" as const);
	};

	const toggleGroup = (group: string, on: boolean) =>
		setSelection((s) => {
			if (on)
				return {
					...s,
					groups: [...s.groups, group],
					files: s.files.filter((f) => !filesOf(group).includes(f)),
				};
			const drop = new Set(filesOf(group));
			const keptGroups = s.groups.filter((g) => g !== group);
			const splitFiles = keptGroups
				.filter((g) => filesOf(g).some((f) => drop.has(f)))
				.flatMap((g) => filesOf(g).filter((f) => !drop.has(f)));
			return {
				...s,
				groups: keptGroups.filter((g) => !filesOf(g).some((f) => drop.has(f))),
				files: [...new Set([...s.files, ...splitFiles])].filter(
					(f) => !drop.has(f),
				),
			};
		});

	const toggleFile = (file: File, on: boolean) =>
		setSelection((s) => {
			if (on) return { ...s, files: [...new Set([...s.files, file.path])] };
			const owning = s.groups.filter((g) => file.groups.includes(g));
			const split = owning.flatMap((g) => filesOf(g));
			return {
				...s,
				groups: s.groups.filter((g) => !owning.includes(g)),
				files: [...new Set([...s.files, ...split])].filter(
					(f) => f !== file.path,
				),
			};
		});

	const setGrep = (grep: string) => setSelection((s) => ({ ...s, grep }));
	const clear = () => setSelection({ groups: [], files: [], grep: "" });

	return {
		selection,
		selectedSet,
		effective,
		groupState,
		toggleGroup,
		toggleFile,
		setGrep,
		clear,
		filesOf,
	};
};

export type RunSelectionState = ReturnType<typeof useRunSelection>;
