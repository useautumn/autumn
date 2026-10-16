import { parseAsString, useQueryState } from "nuqs";

/** The `atom` query param that opens a new Atom's setup rather than one of the env's Atoms. */
export const NEW_ATOM = "new";

/** Each view the org opens is its own history entry, so Back (or Cmd+[) returns to the one before. */
const atomParam = parseAsString.withOptions({ history: "push" });

/** Which of the env's Atoms the URL opens: the list, one Atom, or a new one's setup. */
export const useAtomSelection = () => {
	const [selected, setSelected] = useQueryState("atom", atomParam);
	return {
		selected,
		open: (atomId: string) => setSelected(atomId),
		create: () => setSelected(NEW_ATOM),
		showAll: () => setSelected(null),
		/** For a view that stopped existing (a setup that became an Atom, an Atom that was removed), so Back skips it. */
		replace: (atomId: string | null) =>
			setSelected(atomId, { history: "replace" }),
	};
};
