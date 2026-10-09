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
import { shadowAtomCacheNames } from "@/internal/byoc/utils/byocCacheUtils.js";
import { decryptData, encryptData } from "@/utils/encryptUtils.js";
import { shadowAtomConfigStore } from "../shadowAtomConfigStore.js";
import { shadowAtomContext } from "../shadowAtomContext.js";
import { shadowAtomRecordToApiCache } from "../shadowAtomRecordToApiCache.js";
import {
	awaitingShadowAtomRecord,
	shadowAtomRecordToConfig,
	shadowAtomStorage,
} from "../shadowAtomStorage.js";
import { startShadowAtomWatch } from "../startShadowAtomWatch.js";
import { withShadowAtomLock } from "../withShadowAtomLock.js";
import { patchShadowAtomConfig } from "./patchShadowAtomConfig.js";

/** The admin token never leaves the server, so a start hands back only the setup link. */
type StartShadowAtomResponse = Omit<CreateByocCacheResponse, "token">;

/** Starts our shadow Atom multi-tenant under a new admin token, or hands back a fresh setup link while it still waits; one past setup is returned as is. */
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
	const existing = await shadowAtomStorage.find();
	const isAwaitingSetup = existing?.status === ByocCacheStatus.AwaitingSetup;
	if (existing && !isAwaitingSetup)
		return {
			...shadowAtomRecordToApiCache({ record: existing }),
			setup_url: null,
		};

	// A setup that is still waiting keeps its admin token, so a fresh link starts the same Atom.
	const { adminEncryptedToken } = await shadowAtomConfigStore.readFromSource();
	const adminToken =
		existing && adminEncryptedToken
			? decryptData(adminEncryptedToken)
			: generateAtomToken();
	const atomCtx = shadowAtomContext();
	const setup = await atomCtx.deployer.start({
		names: shadowAtomCacheNames(),
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
				machine,
				region: DEFAULT_BYOC_CACHE_AWS_REGION,
			});
	await patchShadowAtomConfig({
		patch: {
			adminEncryptedToken: encryptData(adminToken),
			...shadowAtomRecordToConfig({ record: started }),
		},
	});

	const record =
		(await refreshAtomRecord({ ctx: atomCtx, record: started })) ?? started;
	await startShadowAtomWatch({
		ctx,
		deploymentGroupId: record.deployment_group_id,
	});
	return {
		...shadowAtomRecordToApiCache({ record }),
		setup_url: setup.setupUrl,
	};
};
