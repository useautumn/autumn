import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { CustomerCreationRecoveryStage } from "./customerCreationRecoveryTypes.js";

/** The worker path reaches the same stages: its plan write is the `pre_commit` → `autumn_committed` step, Stripe linking follows. */
export const setCustomerCreationRecoveryStage = ({
	ctx,
	stage,
}: {
	ctx: AutumnContext;
	stage: CustomerCreationRecoveryStage;
}) => {
	ctx.state.customerCreationRecoveryStage = stage;
};

export const getCustomerCreationRecoveryStage = ({
	ctx,
}: {
	ctx: AutumnContext;
}): CustomerCreationRecoveryStage =>
	ctx.state.customerCreationRecoveryStage ?? "lookup";
