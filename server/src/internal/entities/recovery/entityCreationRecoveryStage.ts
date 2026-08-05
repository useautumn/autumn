import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getCustomerCreationRecoveryStage } from "@/internal/customers/recovery/customerCreationRecoveryStage.js";
import type { EntityCreationRecoveryStage } from "./entityCreationRecoveryTypes.js";

const ENTITY_CREATION_RECOVERY_STAGE_KEY = "entityCreationRecoveryStage";

const RECOVERY_STAGES = new Set<EntityCreationRecoveryStage>([
	"lookup",
	"customer_committed",
	"entitlements_updating",
	"seat_charge",
	"entities_committed",
	"completed",
]);

export const setEntityCreationRecoveryStage = ({
	ctx,
	stage,
}: {
	ctx: AutumnContext;
	stage: EntityCreationRecoveryStage;
}) => {
	ctx.extraLogs[ENTITY_CREATION_RECOVERY_STAGE_KEY] = stage;
};

export const getEntityCreationRecoveryStage = ({
	ctx,
}: {
	ctx: AutumnContext;
}): EntityCreationRecoveryStage => {
	const stage = ctx.extraLogs[ENTITY_CREATION_RECOVERY_STAGE_KEY];
	return typeof stage === "string" &&
		RECOVERY_STAGES.has(stage as EntityCreationRecoveryStage)
		? (stage as EntityCreationRecoveryStage)
		: "lookup";
};

/** Validation resolves the customer through getOrCreateCustomer, which can commit
 *  an Autumn customer and then fail part-way through attaching its paid defaults.
 *  The entity stage still reads `lookup` there, so the customer's own stage has to
 *  veto the replay: creating the entity would bury that half-finished attach. */
export const resolveEntityCreationFailureStage = ({
	ctx,
}: {
	ctx: AutumnContext;
}): EntityCreationRecoveryStage => {
	const stage = getEntityCreationRecoveryStage({ ctx });
	if (stage !== "lookup") return stage;

	return getCustomerCreationRecoveryStage({ ctx }) === "autumn_committed"
		? "customer_committed"
		: stage;
};
