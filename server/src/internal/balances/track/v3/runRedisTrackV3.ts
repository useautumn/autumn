import type {
    FullSubject,
    TrackDeduction,
    TrackParams,
    TrackResponseV3,
} from "@autumn/shared";
import { tryCatch } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { globalEventBatchingManager } from "@/internal/balances/events/EventBatchingManager.js";
import { resolveInternalProductIdForEvent } from "@/internal/balances/events/resolveInternalProductIdForEvent.js";
import {
    buildEventInfo,
    initEvent,
} from "@/internal/balances/events/initEvent.js";
import {
    deductionToTrackResponseV2,
    executeRedisDeductionV2,
    projectMutationLogsToTrackDeductionsV2,
} from "@/internal/balances/utils/deductionV2/index.js";
import { globalSyncBatchingManagerV3 } from "@/internal/balances/utils/sync/SyncBatchingManagerV3.js";
import type { FeatureDeduction } from "../../utils/types/featureDeduction.js";
import type { RolloverUpdate } from "../../utils/types/rolloverUpdate.js";
import { handleRedisTrackErrorV3 } from "./handleRedisTrackErrorV3.js";

const buildAiCreditCostProperty = ({
	featureDeductions,
	deductions,
}: {
	featureDeductions: FeatureDeduction[];
	deductions: TrackDeduction[];
}): Record<string, number> | undefined => {
	const aiDeduction = featureDeductions.find((d) => d.tokenUsage);
	if (!aiDeduction) return;

	const creditCost: Record<string, number> = {};
	for (const deduction of deductions) {
		if (deduction.feature_id === aiDeduction.feature.id) continue;
		if (!deduction.value) continue;
		creditCost[deduction.feature_id] =
			(creditCost[deduction.feature_id] ?? 0) + deduction.value;
	}

	return Object.keys(creditCost).length > 0 ? creditCost : undefined;
};

const queueSyncItem = ({
	ctx,
	body,
	fullSubject,
	rolloverUpdates,
	modifiedCusEntIdsByFeatureId,
}: {
	ctx: AutumnContext;
	body: TrackParams;
	fullSubject: FullSubject;
	rolloverUpdates: Record<string, RolloverUpdate>;
	modifiedCusEntIdsByFeatureId: Record<string, string[]>;
}): void => {
	const cusEntIds = Object.values(modifiedCusEntIdsByFeatureId).flat();
	const rolloverIds = Object.keys(rolloverUpdates);

	if (cusEntIds.length === 0 && rolloverIds.length === 0) return;


	globalSyncBatchingManagerV3.addSyncItem({
		customerId: body.customer_id,
		orgId: ctx.org.id,
		env: ctx.env,
		cusEntIds,
		rolloverIds,
		entityId: fullSubject.entityId,
		modifiedCusEntIdsByFeatureId,
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
	overageBehavior: "cap" | "reject";
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
	} = result;

	queueSyncItem({
		ctx,
		body,
		fullSubject: updatedFullSubject,
		rolloverUpdates,
		modifiedCusEntIdsByFeatureId,
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
		deductions,
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
