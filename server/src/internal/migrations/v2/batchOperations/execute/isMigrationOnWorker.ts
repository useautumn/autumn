import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { isOrgFullyOnWorker } from "@/internal/misc/rollouts/isBalanceWorkerRolloutEnabled.js";
import type {
	BatchMigrationExecutionPatch,
	BatchMigrationExecutionPlan,
} from "../types/index.js";

/** License ops stay SQL by decision; replaces, adds and repoints until their worker phase lands. */
const hasOnlyWorkerOps = ({
	patch,
}: {
	patch: BatchMigrationExecutionPatch;
}): boolean =>
	patch.licenseEntitlementOps.length === 0 &&
	patch.replaceEntitlementOps.length === 0 &&
	patch.addEntitlementOps.length === 0 &&
	!patch.repointCustomerProduct;

/** The one switch: a fully routed org's migration writes through the worker, anything else runs dev's SQL path. */
export const isMigrationOnWorker = ({
	ctx,
	plan,
}: {
	ctx: Pick<AutumnContext, "org">;
	plan: BatchMigrationExecutionPlan;
}): boolean =>
	isOrgFullyOnWorker({ ctx }) &&
	plan.patches.every((patch) => hasOnlyWorkerOps({ patch }));
