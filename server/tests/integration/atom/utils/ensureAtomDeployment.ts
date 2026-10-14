import { ByocCacheStatus, type CreateByocCacheResponse } from "@autumn/shared";
import type { AutumnInt } from "@/external/autumn/autumnCli.js";

export type TestAtom = { endpointUrl: string; token: string };

export const ensureAtomDeployment = async ({
	autumn,
}: {
	autumn: AutumnInt;
}): Promise<TestAtom> => {
	await autumn.post("/byoc.get_atom", {});
	const atom: CreateByocCacheResponse = await autumn.post(
		"/byoc.create_atom",
		{},
	);
	if (atom.status !== ByocCacheStatus.Ready || !atom.endpoint_url)
		throw new Error(`The org's Atom is not ready: ${atom.status}`);
	return { endpointUrl: atom.endpoint_url, token: atom.token };
};

export const atomIsHosted = (): boolean =>
	Boolean(process.env.ALIEN_API_KEY || process.env.ALIEN_MANAGER_URL);

export const deleteAtomDeployment = async ({
	autumn,
}: {
	autumn: AutumnInt;
}): Promise<void> => {
	if (atomIsHosted()) return;
	await autumn.post("/byoc.delete_atom", {});
};
