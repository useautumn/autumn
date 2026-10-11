import {
	type ByocCacheMachine,
	ByocCacheStatus,
	type CreateByocCacheResponse,
	DEFAULT_BYOC_CACHE_AWS_REGION,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { refreshAtomRecord } from "@/internal/byoc/atomRecords/refreshAtomRecord.js";
import {
	atomTokenToHash,
	generateAtomToken,
} from "@/internal/byoc/utils/atomTokenUtils.js";
import { decryptData, encryptData } from "@/utils/encryptUtils.js";
import { getShadowAtomDeployer } from "../getShadowAtomDeployer.js";
import { shadowAtomConfigStore } from "../shadowAtomConfigStore.js";
import { shadowAtomContext } from "../shadowAtomContext.js";
import {
	nextShadowAtomNames,
	shadowAtomRecordNames,
} from "../shadowAtomNames.js";
import { shadowAtomRecordToApiCache } from "../shadowAtomRecordToApiCache.js";
import {
	awaitingShadowAtomRecord,
	findShadowAtomRecords,
	shadowAtomRecordToCurrentConfig,
} from "../shadowAtomStorage.js";
import { startShadowAtomWatch } from "../startShadowAtomWatch.js";
import { withShadowAtomLock } from "../withShadowAtomLock.js";
import { patchShadowAtomConfig } from "./patchShadowAtomConfig.js";

/** The admin token never leaves the server, so a start hands back only the setup link. */
type StartShadowAtomResponse = Omit<CreateByocCacheResponse, "token">;

/** Starts a shadow Atom multi-tenant under a new admin token, or hands back a fresh setup link while it still waits; one past setup is returned as is. */
export const startShadowAtom = ({
	ctx,
	machine,
}: {
	ctx: AutumnContext;
	machine: ByocCacheMachine;
}): Promise<StartShadowAtomResponse> =>
	withShadowAtomLock({ fn: () => startShadowAtomSetup({ ctx, machine }) });

const startShadowAtomSetup = async ({
	ctx,
	machine,
}: {
	ctx: AutumnContext;
	machine: ByocCacheMachine;
}): Promise<StartShadowAtomResponse> => {
	const { current: existing, previous } = await findShadowAtomRecords();
	const isAwaitingSetup = existing?.status === ByocCacheStatus.AwaitingSetup;
	if (existing && !isAwaitingSetup)
		return {
			...shadowAtomRecordToApiCache({ record: existing }),
			setup_url: null,
		};

	// A setup that is still waiting keeps its admin token and names, so a fresh link starts the same Atom.
	const { adminEncryptedToken } = await shadowAtomConfigStore.readFromSource();
	const adminToken =
		existing && adminEncryptedToken
			? decryptData(adminEncryptedToken)
			: generateAtomToken();
	const names = existing
		? {
				...shadowAtomRecordNames({ record: existing }),
				atomId: existing.atom_id,
			}
		: nextShadowAtomNames({ previous });
	const setup = await getShadowAtomDeployer().start({
		names: { externalId: names.externalId, label: names.label },
		auth: {
			mode: "multi_tenant",
			tokenHash: atomTokenToHash({ token: adminToken }),
		},
		machine,
		region: DEFAULT_BYOC_CACHE_AWS_REGION,
	});
	const started = existing
		? {
				...existing,
				deployment_group_id: setup.deploymentGroupId,
				cpu: machine.cpu,
				memory: machine.memory,
			}
		: awaitingShadowAtomRecord({
				deploymentGroupId: setup.deploymentGroupId,
				atomId: names.atomId,
				stackName: names.label,
				machine,
				region: DEFAULT_BYOC_CACHE_AWS_REGION,
			});
	await patchShadowAtomConfig({
		patch: {
			adminEncryptedToken: encryptData(adminToken),
			...shadowAtomRecordToCurrentConfig({ record: started }),
		},
	});

	const record =
		(await refreshAtomRecord({
			ctx: shadowAtomContext({
				deploymentGroupId: started.deployment_group_id,
			}),
			record: started,
		})) ?? started;
	await startShadowAtomWatch({
		ctx,
		deploymentGroupId: record.deployment_group_id,
	});
	return {
		...shadowAtomRecordToApiCache({ record }),
		setup_url: setup.setupUrl,
	};
};
