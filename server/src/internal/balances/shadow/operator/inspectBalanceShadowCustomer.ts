import { isDeepStrictEqual } from "node:util";
import {
	catalogRowsToCatalog,
	findCustomerEntitlementsForFeature,
	type InitializationDecision,
	type WorkerCustomerEntitlement,
} from "@autumn/balance-engine";
import type { BalanceWorkerClient } from "@autumn/balance-worker-client";
import type { FullSubject } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import {
	fullSubjectToCatalogRows,
	fullSubjectToCustomerState,
} from "../../balanceWorker/fullSubjectToCustomerState.js";
import { initializeBalanceWorkerCustomer } from "../../balanceWorker/initializeBalanceWorkerCustomer.js";
import { checkParamsToCheckCommand } from "../../check/balanceWorker/balanceWorkerCheckRequest.js";

export type BalanceShadowInspection = {
	status: "preview" | "equal_at_read" | "different_at_read" | "inconclusive";
	initialization?: InitializationDecision["kind"];
	redis?: Record<string, WorkerCustomerEntitlement>;
	worker?: Record<string, WorkerCustomerEntitlement & { revision: number }>;
	reason?: string;
};

export async function inspectBalanceShadowCustomer({
	ctx,
	customerId,
	featureIds,
	runId,
	expiresAt,
	mode,
	execute = false,
	client,
	loadSubject,
}: {
	ctx: AutumnContext;
	customerId: string;
	featureIds: string[];
	runId: string;
	expiresAt: number;
	mode: "initialize" | "compare";
	execute?: boolean;
	client: Pick<BalanceWorkerClient, "initialize" | "check">;
	loadSubject: () => Promise<FullSubject>;
}): Promise<BalanceShadowInspection> {
	const result: BalanceShadowInspection = { status: "inconclusive" };
	try {
		const fullSubject = await loadSubject();
		if (fullSubject.customerId !== customerId)
			throw new Error("Redis customer identity does not match the cohort");
		const state = fullSubjectToCustomerState({ ctx, fullSubject, featureIds });
		const catalog = catalogRowsToCatalog({
			rows: fullSubjectToCatalogRows({ ctx, fullSubject, featureIds }),
		});
		const redis: Record<string, WorkerCustomerEntitlement> = {};
		for (const featureId of featureIds) {
			const [entitlement] = findCustomerEntitlementsForFeature({
				state,
				catalog,
				featureId,
			});
			if (!entitlement) throw new Error(`No row funds ${featureId}`);
			redis[featureId] = entitlement;
		}
		result.redis = redis;
		for (const entitlement of Object.values(redis)) {
			if (
				(entitlement.next_reset_at != null &&
					entitlement.next_reset_at <= expiresAt) ||
				(entitlement.expires_at != null && entitlement.expires_at <= expiresAt)
			)
				throw new Error("Reset or expiry falls inside the shadow window");
		}
		if (mode === "initialize") {
			if (expiresAt <= ctx.timestamp)
				throw new Error("The shadow window has expired");
			if (!execute) return { ...result, status: "preview" };
			const initialization = await initializeBalanceWorkerCustomer({
				ctx,
				fullSubject,
				featureIds,
				client,
				commandId: JSON.stringify(["shadow", runId, state.identity]),
			});
			result.initialization = initialization.kind;
			if (initialization.kind === "already_initialized")
				throw new Error(
					"Worker state already exists; use compare or a fresh isolated namespace, not a new baseline",
				);
		}
		result.worker = {};
		let equal = true;
		let revision: number | undefined;
		for (const featureId of featureIds) {
			const command = checkParamsToCheckCommand({
				ctx,
				body: {
					customer_id: customerId,
					feature_id: featureId,
					required_balance: 1,
				},
			});
			const decision = await client.check({ command });
			if (decision.kind !== "decided")
				throw new Error(`Worker check unsupported: ${decision.reason}`);
			result.worker[featureId] = {
				...decision.customerEntitlement,
				revision: decision.revision,
			};
			if (revision !== undefined && revision !== decision.revision)
				throw new Error("Worker changed during the operation");
			revision = decision.revision;
			equal &&= isDeepStrictEqual(
				redis[featureId],
				decision.customerEntitlement,
			);
		}
		const after = await loadSubject();
		if (
			after.subjectViewEpoch !== fullSubject.subjectViewEpoch ||
			!isDeepStrictEqual(
				state,
				fullSubjectToCustomerState({ ctx, fullSubject: after, featureIds }),
			)
		)
			throw new Error("Redis baseline changed during the operation");
		return { ...result, status: equal ? "equal_at_read" : "different_at_read" };
	} catch (error) {
		return {
			...result,
			status: "inconclusive",
			reason:
				error instanceof Error ? error.message : "Unknown operator failure",
		};
	}
}
