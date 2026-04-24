import type { FullSubject, TrackParams, TrackResponseV3 } from "@autumn/shared";
import { tryCatch } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { globalEventBatchingManager } from "@/internal/balances/events/EventBatchingManager.js";
import {
	buildEventInfo,
	initEvent,
} from "@/internal/balances/events/initEvent.js";
import {
	deductionToTrackResponseV2,
	executeRedisDeductionV2,
} from "@/internal/balances/utils/deductionV2/index.js";
import { globalSyncBatchingManagerV3 } from "@/internal/balances/utils/sync/SyncBatchingManagerV3.js";
import type { FeatureDeduction } from "../../utils/types/featureDeduction.js";
import type { RolloverUpdate } from "../../utils/types/rolloverUpdate.js";
import { handleRedisTrackErrorV3 } from "./handleRedisTrackErrorV3.js";

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

	ctx.logger.info(`[QUEUE SYNC V4] (${body.customer_id})`);
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
}: {
	ctx: AutumnContext;
	body: TrackParams;
	fullSubject: FullSubject;
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
	} = result;

	queueSyncItem({
		ctx,
		body,
		fullSubject: updatedFullSubject,
		rolloverUpdates,
		modifiedCusEntIdsByFeatureId,
	});

	queueEvent({ ctx, body, fullSubject });

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
	};
};
