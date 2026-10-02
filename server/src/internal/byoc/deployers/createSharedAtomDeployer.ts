import { atomTokenToHash, generateAtomToken } from "../utils/atomTokenUtils.js";
import { postToSharedAtom } from "./postToSharedAtom.js";
import type {
	SharedAtomAddress,
	SharedAtomDeployer,
} from "./types/sharedAtom.js";

const registerOnSharedAtom = async ({
	atom,
	atomId,
}: {
	atom: SharedAtomAddress;
	atomId: string;
}): Promise<{ token: string }> => {
	const token = generateAtomToken();
	await postToSharedAtom({
		atom,
		route: "atoms.put",
		body: { id: atomId, token_hash: atomTokenToHash({ token }) },
	});
	return { token };
};

const unregisterFromSharedAtom = async ({
	atom,
	atomId,
}: {
	atom: SharedAtomAddress;
	atomId: string;
}): Promise<void> => {
	await postToSharedAtom({ atom, route: "atoms.delete", body: { id: atomId } });
};

/** Our shadow Atom (ATOM_MODE=shared): one folder and one token per org. Only the admin routes reach it. */
export const createSharedAtomDeployer = ({
	atom,
}: {
	atom: SharedAtomAddress;
}): SharedAtomDeployer => ({
	register: (params) => registerOnSharedAtom({ atom, ...params }),
	unregister: (params) => unregisterFromSharedAtom({ atom, ...params }),
});
