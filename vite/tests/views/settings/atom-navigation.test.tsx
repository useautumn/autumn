import { describe, expect, test } from "bun:test";
import { NuqsTestingAdapter } from "nuqs/adapters/testing";
import { renderToStaticMarkup } from "react-dom/server";
import { useAtomSelection } from "../../../src/views/settings/sections/components/atom/useAtomSelection";

type Selection = ReturnType<typeof useAtomSelection>;
type UrlUpdate = { url: string; history: string };

/** The Atom section's selection on `url`, and every URL change it then makes, as the router would apply it. */
const atomSelectionOn = (url: string) => {
	const updates: UrlUpdate[] = [];
	let selection: Selection | undefined;
	const Capture = () => {
		selection = useAtomSelection();
		return null;
	};
	renderToStaticMarkup(
		<NuqsTestingAdapter
			searchParams={url}
			onUrlUpdate={({ queryString, options }) =>
				updates.push({ url: queryString, history: options.history })
			}
		>
			<Capture />
		</NuqsTestingAdapter>,
	);
	if (!selection) throw new Error("useAtomSelection did not render");
	return { selection, updates };
};

describe("moving between the Atom list and an Atom", () => {
	test("opening an Atom from the list is its own history entry, so Back returns to the list", async () => {
		const { selection, updates } = atomSelectionOn("?tab=atom");
		await selection.open("atom_1");
		expect(updates).toEqual([
			{ url: "?tab=atom&atom=atom_1", history: "push" },
		]);
	});

	test("All Atoms from an Atom's page pushes the list, like any other view", async () => {
		const { selection, updates } = atomSelectionOn("?tab=atom&atom=atom_1");
		await selection.showAll();
		expect(updates).toEqual([{ url: "?tab=atom", history: "push" }]);
	});

	test("New Atom is its own history entry", async () => {
		const { selection, updates } = atomSelectionOn("?tab=atom");
		await selection.create();
		expect(updates).toEqual([{ url: "?tab=atom&atom=new", history: "push" }]);
	});

	test("a setup that became an Atom replaces its entry, so Back from the Atom goes to the list, not the finished setup", async () => {
		const { selection, updates } = atomSelectionOn("?tab=atom&atom=new");
		await selection.replace("atom_2");
		expect(updates).toEqual([
			{ url: "?tab=atom&atom=atom_2", history: "replace" },
		]);
	});
});
