import { afterAll, beforeAll, beforeEach } from "bun:test";
import { isBalanceWorkerRoute } from "@tests/utils/balanceWorkerRouteTestUtils.js";
import defaultCtx from "@tests/utils/testInitUtils/createTestContext.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { atomIsHosted } from "../ensureAtomDeployment.js";
import { createReplicaSet } from "./createReplicaSet.js";
import type { ReplicaSet } from "./types/replicaSet.js";

export const replicaSetRunsHere = isBalanceWorkerRoute() && !atomIsHosted();

const STARTUP_TIMEOUT_MS = 120_000;

export const useReplicaSet = ({ size }: { size: number }) => {
	let replicaSet: ReplicaSet | undefined;

	beforeAll(async () => {
		if (!replicaSetRunsHere) return;
		const autumn = new AutumnInt({ secretKey: defaultCtx.orgSecretKey });
		replicaSet = await createReplicaSet({ autumn, size });
	}, STARTUP_TIMEOUT_MS);

	beforeEach(async () => {
		await replicaSet?.restore(size);
	}, STARTUP_TIMEOUT_MS);

	afterAll(async () => {
		await replicaSet?.close();
	});

	return (): ReplicaSet => {
		if (!replicaSet) throw new Error("The replica set has not started");
		return replicaSet;
	};
};
