import { ErrCode, RecaseError } from "@autumn/shared";
import type { AtomDeployer } from "../deployers/types/atomDeployer.js";
import {
	type AtomOwner,
	atomExternalId,
	nextAtomId,
} from "./byocCacheUtils.js";

/** More leftover groups than this for one owner means something else is wrong; refuse instead of looping. */
const MAX_LEFTOVER_GROUPS = 8;

/**
 * The owner's next Atom id that names no existing deployment group. A removed Atom's group can outlive
 * its record, and a start by that external id would reuse it, so each one found is taken as an id too.
 */
export const nextFreeAtomId = async ({
	owner,
	existingAtomIds,
	deployer,
}: {
	owner: AtomOwner;
	existingAtomIds: string[];
	deployer: Pick<AtomDeployer, "hasGroup">;
}) => {
	const takenAtomIds = [...existingAtomIds];
	for (let leftovers = 0; leftovers <= MAX_LEFTOVER_GROUPS; leftovers++) {
		const atomId = nextAtomId({ owner, existingAtomIds: takenAtomIds });
		const externalId = atomExternalId({ owner, atomId });
		if (!(await deployer.hasGroup({ externalId }))) return atomId;
		takenAtomIds.push(atomId);
	}
	throw new RecaseError({
		message: `More than ${MAX_LEFTOVER_GROUPS} leftover Atom deployment groups for ${owner.idParts.join(".")}; delete them in alien first.`,
		code: ErrCode.ByocUnavailable,
		statusCode: 409,
	});
};
