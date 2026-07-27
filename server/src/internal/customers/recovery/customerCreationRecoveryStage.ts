import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { CustomerCreationRecoveryStage } from "./customerCreationRecoveryTypes.js";

const CUSTOMER_CREATION_RECOVERY_STAGE_KEY = "customerCreationRecoveryStage";

const RECOVERY_STAGES = new Set<CustomerCreationRecoveryStage>([
	"lookup",
	"pre_commit",
	"existing",
	"autumn_committed",
	"completed",
]);

export const setCustomerCreationRecoveryStage = ({
	ctx,
	stage,
}: {
	ctx: AutumnContext;
	stage: CustomerCreationRecoveryStage;
}) => {
	ctx.extraLogs[CUSTOMER_CREATION_RECOVERY_STAGE_KEY] = stage;
};

export const getCustomerCreationRecoveryStage = ({
	ctx,
}: {
	ctx: AutumnContext;
}): CustomerCreationRecoveryStage => {
	const stage = ctx.extraLogs[CUSTOMER_CREATION_RECOVERY_STAGE_KEY];
	return typeof stage === "string" &&
		RECOVERY_STAGES.has(stage as CustomerCreationRecoveryStage)
		? (stage as CustomerCreationRecoveryStage)
		: "lookup";
};
