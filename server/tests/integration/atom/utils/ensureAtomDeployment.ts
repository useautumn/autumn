import {
	ByocCacheStatus,
	type CreateByocCacheResponse,
	type ListByocAtomsResponse,
} from "@autumn/shared";
import type { AutumnInt } from "@/external/autumn/autumnCli.js";

/** An org's running Atom: where it answers, and the token that opens it. */
export type TestAtom = { endpointUrl: string; token: string };

/** The org's oldest Atom, created when it has none. Safe to call from every test: an Atom that exists is handed back as is. */
export const ensureAtomDeployment = async ({
	autumn,
}: {
	autumn: AutumnInt;
}): Promise<TestAtom> => {
	// A list re-reads each Atom's state, so a record whose Atom is gone is created again below.
	const { atoms }: ListByocAtomsResponse = await autumn.post(
		"/byoc.list_atoms",
		{},
	);
	const atom: CreateByocCacheResponse = await autumn.post("/byoc.create_atom", {
		atom_id: atoms[0]?.id,
	});
	if (atom.status !== ByocCacheStatus.Ready || !atom.endpoint_url)
		throw new Error(`The org's Atom is not ready: ${atom.status}`);
	return { endpointUrl: atom.endpoint_url, token: atom.token };
};

/** True when the server deploys Atoms through alien: a real machine in a real account, never a test's to delete. */
export const atomIsHosted = (): boolean =>
	Boolean(process.env.ALIEN_API_KEY || process.env.ALIEN_MANAGER_URL);

/** Deletes every Atom the org runs. */
export const deleteAtomDeployment = async ({
	autumn,
}: {
	autumn: AutumnInt;
}): Promise<void> => {
	// A hosted Atom is a real machine in a real account: never a test's to delete.
	if (atomIsHosted()) return;
	const { atoms }: ListByocAtomsResponse = await autumn.post(
		"/byoc.list_atoms",
		{},
	);
	for (const { id } of atoms)
		await autumn.post("/byoc.delete_atom", { atom_id: id });
};
