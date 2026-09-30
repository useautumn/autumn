import { ByocCacheStatus, type CreateByocCacheResponse } from "@autumn/shared";
import type { AutumnInt } from "@/external/autumn/autumnCli.js";

/** An org's running Atom: where it answers, and the token that opens it. */
export type TestAtom = { endpointUrl: string; token: string };

/** The org's Atom, created when it has none. Safe to call from every test: an Atom that exists is handed back as is. */
export const ensureAtomDeployment = async ({
	autumn,
}: {
	autumn: AutumnInt;
}): Promise<TestAtom> => {
	// A get re-reads the Atom's state, so a record whose Atom is gone is created again below.
	await autumn.post("/byoc.get_atom", {});
	const atom: CreateByocCacheResponse = await autumn.post(
		"/byoc.create_atom",
		{},
	);
	if (atom.status !== ByocCacheStatus.Ready || !atom.endpoint_url)
		throw new Error(`The org's Atom is not ready: ${atom.status}`);
	return { endpointUrl: atom.endpoint_url, token: atom.token };
};

export const deleteAtomDeployment = async ({
	autumn,
}: {
	autumn: AutumnInt;
}): Promise<void> => {
	await autumn.post("/byoc.delete_atom", {});
};
