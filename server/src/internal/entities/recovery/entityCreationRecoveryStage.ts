import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { EntityCreationRecoveryStage } from "./entityCreationRecoveryTypes.js";

const ENTITY_CREATION_RECOVERY_STAGE_KEY = "entityCreationRecoveryStage";

const RECOVERY_STAGES = new Set<EntityCreationRecoveryStage>([
	"lookup",
	"pre_commit",
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
