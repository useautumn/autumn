import { expect } from "bun:test";
import {
	isWorkerSubjectNotFound,
	readAtomSubjectBody,
} from "@autumn/byoc/subjects";
import type { Organization } from "@autumn/shared";
import { pollUntilAsserted } from "@tests/utils/genUtils.js";
import { getBalanceWorkerClient } from "@/external/balanceWorker/getBalanceWorkerClient.js";

/** Polls until the subject's worker answers that it holds no such customer (or entity): nothing resident, nothing in Postgres. */
export const expectWorkerHoldsNoSubject = async ({
	org,
	env,
	customerId,
	entityId = null,
	timeoutMs,
}: {
	org: Organization;
	env: string;
	customerId: string;
	entityId?: string | null;
	timeoutMs?: number;
}) =>
	pollUntilAsserted({
		fetch: () =>
			readAtomSubjectBody({
				ctx: { balanceWorkerClient: getBalanceWorkerClient() },
				identity: { orgId: org.id, env, customerId, entityId },
				org,
				requestId: `test_worker_holds_${crypto.randomUUID()}`,
			}).then(
				(body) => ({ body, error: null as unknown }),
				(error: unknown) => ({ body: null, error }),
			),
		assert: ({ body, error }) => {
			expect(body).toBeNull();
			expect(isWorkerSubjectNotFound({ error })).toBe(true);
		},
		timeoutMs,
	});
