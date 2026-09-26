import type {
	CatalogRow,
	CheckCommand,
	MeteringIdentity,
	SubjectState,
	TrackCommand,
} from "@autumn/balance-engine";
import { BalanceWorkerClientError } from "@autumn/balance-worker-client";
import {
	fullSubjectToCatalogRows,
	fullSubjectToSubjectState,
} from "@/internal/balances/balanceWorker/fullSubjectToSubjectState.js";
import type {
	ReplayHydrationSelection,
	ReplayHydrationSource,
} from "@/internal/balances/replay/replayHydrationContracts.js";
import { createCustomerFixture } from "../balanceWorker/customer-fixture.js";

export const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

export function createReplayHydrationFixture({
	identity,
	baseline = { id: "snapshot-2026-09-16", capturedAtMs: 1_790_000_000_000 },
	featureIds = ["messages"],
}: {
	identity?: MeteringIdentity;
	baseline?: ReplayHydrationSelection["baseline"];
	featureIds?: readonly string[];
} = {}) {
	const fixture = createCustomerFixture();
	const selectedIdentity = identity ?? {
		orgId: fixture.ctx.org.id,
		env: fixture.ctx.env,
		customerId: fixture.fullSubject.customerId,
		entityId: null,
	};
	fixture.ctx.org.id = selectedIdentity.orgId;
	fixture.ctx.env = selectedIdentity.env as typeof fixture.ctx.env;
	fixture.ctx.timestamp = baseline.capturedAtMs;
	fixture.fullSubject.customer.id = selectedIdentity.customerId;
	fixture.fullSubject.customer.org_id = selectedIdentity.orgId;
	fixture.fullSubject.customer.env =
		selectedIdentity.env as typeof fixture.fullSubject.customer.env;
	fixture.fullSubject.customerId = selectedIdentity.customerId;
	const state = fullSubjectToSubjectState({
		ctx: fixture.ctx,
		fullSubject: fixture.fullSubject,
		featureIds,
	});
	const catalogRows = fullSubjectToCatalogRows({
		ctx: fixture.ctx,
		fullSubject: fixture.fullSubject,
		featureIds,
	});
	const selection: ReplayHydrationSelection = {
		identity: selectedIdentity,
		baseline,
		featureIds,
	};
	return {
		...fixture,
		selection,
		state,
		catalogRows,
		trackCommand: createTrackCommand({
			identity: selectedIdentity,
			occurredAt: baseline.capturedAtMs + 1_000,
		}),
		checkCommand: createCheckCommand({
			identity: selectedIdentity,
			occurredAt: baseline.capturedAtMs + 1_000,
		}),
	};
}

export function createTrackCommand({
	identity,
	commandId = "track-command",
	requestId = "track-request",
	value = 5,
	occurredAt,
}: {
	identity: MeteringIdentity;
	commandId?: string;
	requestId?: string;
	value?: number;
	occurredAt: number;
}): TrackCommand {
	return {
		schemaVersion: 1,
		type: "track",
		org: {
			config: {
				reverse_deduction_order: false,
				block_overdue_entitlements: false,
				include_past_due: true,
			},
		},
		commandId,
		requestId,
		identity,
		featureId: "messages",
		internalFeatureId: "feat_messages",
		value,
		overageBehavior: "reject",
		properties: null,
		usageEvent: { name: "messages", idempotencyKey: null, id: null },
		occurredAt,
	};
}

export function createCheckCommand({
	identity,
	requestId = "check-request",
	occurredAt,
}: {
	identity: MeteringIdentity;
	requestId?: string;
	occurredAt: number;
}): CheckCommand {
	return {
		schemaVersion: 1,
		type: "check",
		org: {
			config: {
				reverse_deduction_order: false,
				block_overdue_entitlements: false,
				include_past_due: true,
			},
		},
		requestId,
		identity,
		featureId: "messages",
		internalFeatureId: "feat_messages",
		requiredBalance: 1,
		properties: null,
		occurredAt,
	};
}

export function createNotInitializedError(): BalanceWorkerClientError {
	return new BalanceWorkerClientError({
		code: "WORKER_ERROR",
		workerCode: "NOT_INITIALIZED",
		outcome: "not_submitted",
		message: "Customer is not initialized",
	});
}

export function createLoadedSource({
	state,
	catalogRows = [],
	onLoad,
}: {
	state: SubjectState;
	catalogRows?: CatalogRow[];
	onLoad?: ReplayHydrationSource["load"];
}): ReplayHydrationSource {
	return {
		load: onLoad ?? (async () => ({ kind: "loaded", state, catalogRows })),
	};
}
