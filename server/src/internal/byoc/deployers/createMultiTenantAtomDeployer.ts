import { atomTokenToHash, generateAtomToken } from "../utils/atomTokenUtils.js";
import { postToMultiTenantAtom } from "./postToMultiTenantAtom.js";
import type {
	MultiTenantAtomAddress,
	MultiTenantAtomDeployer,
} from "./types/multiTenantAtom.js";

const registerOnMultiTenantAtom = async ({
	atom,
	atomId,
}: {
	atom: MultiTenantAtomAddress;
	atomId: string;
}): Promise<{ token: string }> => {
	const token = generateAtomToken();
	await postToMultiTenantAtom({
		atom,
		route: "atoms.put",
		body: { id: atomId, token_hash: atomTokenToHash({ token }) },
	});
	return { token };
};

const unregisterFromMultiTenantAtom = async ({
	atom,
	atomId,
}: {
	atom: MultiTenantAtomAddress;
	atomId: string;
}): Promise<void> => {
	await postToMultiTenantAtom({
		atom,
		route: "atoms.delete",
		body: { id: atomId },
	});
};

/** Our shadow Atom (ATOM_MODE=multi_tenant): one folder and one token per org. Only the admin routes reach it. */
export const createMultiTenantAtomDeployer = ({
	atom,
}: {
	atom: MultiTenantAtomAddress;
}): MultiTenantAtomDeployer => ({
	register: (params) => registerOnMultiTenantAtom({ atom, ...params }),
	unregister: (params) => unregisterFromMultiTenantAtom({ atom, ...params }),
});
