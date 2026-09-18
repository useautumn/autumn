import type {
	CheckCommand,
	CommandOrg,
	TrackCommand,
} from "@autumn/balance-engine";
import { AppEnv, CheckParamsSchema, TrackParamsSchema } from "@autumn/shared";
import { BalanceWorkerUnsupportedError } from "../../balanceWorker/balanceWorkerErrors.js";
import type { BalanceWorkerRequestContext } from "../../balanceWorker/balanceWorkerRequestContext.js";
import { validateBalanceWorkerRequest } from "../../balanceWorker/validateBalanceWorkerRequest.js";
import { checkParamsToCheckCommand } from "../../check/balanceWorker/balanceWorkerCheckRequest.js";
import { trackParamsToTrackCommand } from "../../track/balanceWorker/balanceWorkerTrackRequest.js";
import {
	REPLAY_BODY_CUSTOMER_ID_FIELD,
	REPLAY_BODY_TIMESTAMP_FIELD,
	type ReplayEnvironment,
	type ReplayManifestRequest,
	type ReplayRequestBody,
} from "../manifest/replayManifestContracts.js";

export type ReplayCheckPlan = Readonly<{
	kind: "check";
	command: CheckCommand;
}>;

export type ReplayTrackPlan = Readonly<{
	kind: "track";
	command: TrackCommand;
}>;

export type ReplayRequestPlan =
	| ReplayCheckPlan
	| ReplayTrackPlan
	| Readonly<{ kind: "refused"; reason: string }>;

const REQUEST_INVALID_REASON = "request_invalid";

const EVENT_NAME_REASON = "event_name_not_supported";

/** Replay cohorts are customer subjects; an entity request has no baseline to verify against yet. */
const ENTITY_REASON = "entity_not_supported";

const CONTEXT_ENV: Record<
	ReplayEnvironment,
	BalanceWorkerRequestContext["env"]
> = {
	live: AppEnv.Live,
	sandbox: AppEnv.Sandbox,
};

export function replayRefusalReasonOf({
	cause,
}: {
	cause: unknown;
}): string | undefined {
	if (!(cause instanceof BalanceWorkerUnsupportedError)) return undefined;
	const data: unknown = (cause as { data?: unknown }).data;
	if (!data || typeof data !== "object" || !("reason" in data))
		return undefined;
	const reason: unknown = data.reason;
	return typeof reason === "string" ? reason : undefined;
}

// The schemas strip unknown keys, so expand has to reach the context first.
function replayContextExpand({
	body,
}: {
	body: ReplayRequestBody;
}): BalanceWorkerRequestContext["expand"] | undefined {
	const expand = body.expand;
	if (expand === undefined) return [];
	if (!Array.isArray(expand)) return undefined;
	return expand.every((entry) => typeof entry === "string")
		? expand
		: undefined;
}

function replayRequestContext({
	request,
	expand,
	orgConfig,
	features,
}: {
	request: ReplayManifestRequest;
	expand: BalanceWorkerRequestContext["expand"];
	orgConfig: CommandOrg["config"];
	features: BalanceWorkerRequestContext["features"];
}): BalanceWorkerRequestContext {
	return {
		id: request.id,
		org: { id: request.orgId, config: orgConfig },
		features,
		env: CONTEXT_ENV[request.env],
		timestamp: request.logicalTimestampMs,
		expand,
	};
}

function normalizedReplayBody({
	request,
}: {
	request: ReplayManifestRequest;
}): ReplayRequestBody {
	return {
		...request.body,
		[REPLAY_BODY_CUSTOMER_ID_FIELD]: request.customerId,
	};
}

// Replay timestamps are logical, so the shared wall-clock refinement cannot judge them.
function trackBodyWithoutTimestamp({ body }: { body: ReplayRequestBody }) {
	const { [REPLAY_BODY_TIMESTAMP_FIELD]: _logical, ...rest } = body;
	return rest;
}

function planCheckCommand({
	ctx,
	body,
}: {
	ctx: BalanceWorkerRequestContext;
	body: ReplayRequestBody;
}): ReplayRequestPlan {
	const parsed = CheckParamsSchema.safeParse(body);
	if (!parsed.success)
		return { kind: "refused", reason: REQUEST_INVALID_REASON };
	return {
		kind: "check",
		command: checkParamsToCheckCommand({ ctx, body: parsed.data }),
	};
}

function planTrackCommand({
	ctx,
	body,
	logicalTimestampMs,
}: {
	ctx: BalanceWorkerRequestContext;
	body: ReplayRequestBody;
	logicalTimestampMs: number;
}): ReplayRequestPlan {
	const parsed = TrackParamsSchema.safeParse(
		trackBodyWithoutTimestamp({ body }),
	);
	if (!parsed.success)
		return { kind: "refused", reason: REQUEST_INVALID_REASON };
	validateBalanceWorkerRequest({ ctx, body: parsed.data });
	if (!parsed.data.feature_id)
		throw new BalanceWorkerUnsupportedError({ reason: EVENT_NAME_REASON });
	return {
		kind: "track",
		command: trackParamsToTrackCommand({
			ctx,
			body: { ...parsed.data, timestamp: logicalTimestampMs },
		}),
	};
}

/** `orgConfig` is what the org runs under now; the replayed command records it like a live one would. */
export function planReplayRequest({
	request,
	orgConfig,
	features = [],
}: {
	request: ReplayManifestRequest;
	orgConfig: CommandOrg["config"];
	/** The org's catalog features; without them a replayed command carries no internal feature id. */
	features?: BalanceWorkerRequestContext["features"];
}): ReplayRequestPlan {
	const expand = replayContextExpand({ body: request.body });
	if (expand === undefined)
		return { kind: "refused", reason: REQUEST_INVALID_REASON };
	const ctx = replayRequestContext({ request, expand, orgConfig, features });
	const body = normalizedReplayBody({ request });
	if (body.entity_id) return { kind: "refused", reason: ENTITY_REASON };
	try {
		return request.operation === "check"
			? planCheckCommand({ ctx, body })
			: planTrackCommand({
					ctx,
					body,
					logicalTimestampMs: request.logicalTimestampMs,
				});
	} catch (cause) {
		const reason = replayRefusalReasonOf({ cause });
		if (reason === undefined) throw cause;
		return { kind: "refused", reason };
	}
}
