import type {
	FullSubject,
	TrackDeduction,
	TrackParams,
	TrackResponseV3,
} from "@autumn/shared";
import { tryCatch } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { globalEventBatchingManager } from "@/internal/balances/events/EventBatchingManager.js";
import {
	buildEventInfo,
	initEvent,
} from "@/internal/balances/events/initEvent.js";
import { resolveInternalProductIdForEvent } from "@/internal/balances/events/resolveInternalProductIdForEvent.js";
import {
	deductionToTrackResponseV2,
	executeRedisDeductionV2,
	projectMutationLogsToTrackDeductionsV2,
} from "@/internal/balances/utils/deductionV2/index.js";
import { globalSyncBatchingManagerV3 } from "@/internal/balances/utils/sync/SyncBatchingManagerV3.js";
import { isSyncCoalesceEnabled } from "@/internal/misc/miscellaneousEdgeConfig/miscellaneousEdgeConfigStore.js";
import type { FeatureDeduction } from "../../utils/types/featureDeduction.js";
import type { RolloverUpdate } from "../../utils/types/rolloverUpdate.js";
import type { UsageWindowUpdate } from "../../utils/types/usageWindowUpdate.js";
import { buildAiCreditCostProperty } from "../utils/buildAiCreditCostProperty.js";
import { handleRedisTrackErrorV3 } from "./handleRedisTrackErrorV3.js";

const queueSyncItem = ({
	ctx,
	body,
	fullSubject,
	rolloverUpdates,
	modifiedCusEntIdsByFeatureId,
	usageWindowUpdates,
}: {
	ctx: AutumnContext;
	body: TrackParams;
	fullSubject: FullSubject;
	rolloverUpdates: Record<string, RolloverUpdate>;
	modifiedCusEntIdsByFeatureId: Record<string, string[]>;
	usageWindowUpdates?: UsageWindowUpdate[];
}): void => {
	const cusEntIds = Object.values(modifiedCusEntIdsByFeatureId).flat();
	const rolloverIds = Object.keys(rolloverUpdates);

	if (
		cusEntIds.length === 0 &&
		rolloverIds.length === 0 &&
		(usageWindowUpdates?.length ?? 0) === 0
	) {
		return;
	}

	globalSyncBatchingManagerV3.addSyncItem({
		customerId: body.customer_id,
		orgId: ctx.org.id,
		env: ctx.env,
		cusEntIds,
		rolloverIds,
		entityId: fullSubject.entityId,
		modifiedCusEntIdsByFeatureId,
		usageWindowUpdates,
		coalesce: ctx.testOptions?.syncCoalesce ?? isSyncCoalesceEnabled(),
		coalesceRedis: ctx.redisV2,
	});
};

const queueEvent = ({
	ctx,
	body,
	fullSubject,
	deductions,
	internalProductId,
}: {
	ctx: AutumnContext;
	body: TrackParams;
	fullSubject: FullSubject;
	deductions: TrackDeduction[];
	internalProductId: string | null;
}): void => {
	if (body.skip_event) return;

	const eventInfo = buildEventInfo(body);

	globalEventBatchingManager.addEvent(
		initEvent({
			ctx,
			eventInfo,
			internalCustomerId: fullSubject.internalCustomerId,
			internalEntityId: fullSubject.internalEntityId,
			customerId: body.customer_id,
			entityId: body.entity_id,
			deductions,
			internalProductId,
		}),
	);
};

export const runRedisTrackV3 = async ({
	ctx,
	fullSubject,
	featureDeductions,
	overageBehavior,
	body,
	idempotencyKey,
}: {
	ctx: AutumnContext;
	fullSubject: FullSubject;
	featureDeductions: FeatureDeduction[];
	overageBehavior: "cap" | "reject" | "overflow";
	body: TrackParams;
	idempotencyKey?: string;
}): Promise<TrackResponseV3> => {
	const { data: result, error } = await tryCatch(
		executeRedisDeductionV2({
			ctx,
			fullSubject,
			entityId: fullSubject.entity?.id ?? undefined,
			deductions: featureDeductions,
			idempotencyKey,
			deductionOptions: {
				overageBehaviour: overageBehavior,
				triggerAutoTopUp: true,
				eventProperties: body.properties,
			},
		}),
	);

	if (error) {
		return handleRedisTrackErrorV3({
			ctx,
			error,
			body,
			fullSubject,
			featureDeductions,
		});
	}

	const {
		updates,
		fullSubject: updatedFullSubject,
		rolloverUpdates,
		modifiedCusEntIdsByFeatureId,
		mutationLogs,
		usageWindowUpdates,
	} = result;

	queueSyncItem({
		ctx,
		body,
		fullSubject: updatedFullSubject,
		rolloverUpdates,
		modifiedCusEntIdsByFeatureId,
		usageWindowUpdates,
	});

	const deductions = projectMutationLogsToTrackDeductionsV2({
		fullSubject: updatedFullSubject,
		mutationLogs,
	});

	const internalProductId = resolveInternalProductIdForEvent({
		fullSubject: updatedFullSubject,
		mutationLogs,
	});

	const aiCreditCost = buildAiCreditCostProperty({
		featureDeductions,
		entries: deductions.map((d) => ({
			featureId: d.feature_id,
			amount: d.value ?? 0,
		})),
	});
	if (aiCreditCost) {
		body.properties = { ...(body.properties ?? {}), credit_cost: aiCreditCost };
	}

	queueEvent({ ctx, body, fullSubject, deductions, internalProductId });

	const { balance, balances } = await deductionToTrackResponseV2({
		ctx,
		fullSubject: updatedFullSubject,
		featureDeductions,
		updates,
	});

	return {
		customer_id: body.customer_id,
		entity_id: body.entity_id,
		event_name: body.event_name,
		value: body.value ?? 1,
		balance,
		balances,
		deductions,
	};
};
