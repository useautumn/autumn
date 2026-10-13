import type { AtomDeployer } from "@/internal/byoc/deployers/types/atomDeployer.js";
import {
	atomNames,
	legacyShadowAtomNames,
	nextAtomId,
	SHADOW_ATOM_OWNER,
} from "@/internal/byoc/utils/byocCacheUtils.js";
import { nextFreeAtomId } from "@/internal/byoc/utils/nextFreeAtomId.js";
import type { ShadowAtomRecord } from "./types/shadowAtomRecord.js";

/** A shadow Atom's names, by its Atom id as an org's Atom is named; one set up before Atom ids keeps its fixed names. */
export const shadowAtomRecordNames = ({
	record,
}: {
	record: Pick<ShadowAtomRecord, "atom_id" | "stack_name">;
}) => {
	if (!record.atom_id) return legacyShadowAtomNames();
	return atomNames({
		owner: SHADOW_ATOM_OWNER,
		atomId: record.atom_id,
		stackName: record.stack_name ?? undefined,
	});
};

/** What the admin routes call a shadow Atom by: its Atom id, or its fixed external id from before Atom ids. */
export const shadowAtomRecordId = ({
	record,
}: {
	record: Pick<ShadowAtomRecord, "atom_id" | "stack_name">;
}) => record.atom_id ?? shadowAtomRecordNames({ record }).externalId;

/** The next shadow Atom's id and names, apart from every earlier one still being removed. */
export const nextShadowAtomNames = ({
	previous,
}: {
	previous: ShadowAtomRecord[];
}) => {
	const atomId = nextAtomId({
		owner: SHADOW_ATOM_OWNER,
		existingAtomIds: previousShadowAtomIds({ previous }),
	});
	return { atomId, ...atomNames({ owner: SHADOW_ATOM_OWNER, atomId }) };
};

/** As `nextShadowAtomNames`, also apart from any earlier Atom whose deployment group outlived its record. */
export const startableShadowAtomNames = async ({
	previous,
	deployer,
}: {
	previous: ShadowAtomRecord[];
	deployer: Pick<AtomDeployer, "hasGroup">;
}) => {
	const atomId = await nextFreeAtomId({
		owner: SHADOW_ATOM_OWNER,
		existingAtomIds: previousShadowAtomIds({ previous }),
		deployer,
	});
	return { atomId, ...atomNames({ owner: SHADOW_ATOM_OWNER, atomId }) };
};

const previousShadowAtomIds = ({
	previous,
}: {
	previous: ShadowAtomRecord[];
}) => previous.map((record) => shadowAtomRecordId({ record }));
