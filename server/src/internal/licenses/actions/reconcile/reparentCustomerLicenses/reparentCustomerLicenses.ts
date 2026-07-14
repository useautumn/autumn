import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { ReconcileContext } from "../types.js";
import { computeReparentPlan } from "./computeReparentPlan.js";
import { executeReparentPlan } from "./executeReparentPlan.js";

/**
 * Transition for stranded state: each seated stranded customer license takes
 * over a phase-adjacent live slot (one row update — seats are anchored by
 * customer license id and never touched), or its seats end. Compute is pure;
 * execute writes and patches the context to mirror the database.
 */
export const reparentCustomerLicenses = async ({
	ctx,
	context,
}: {
	ctx: AutumnContext;
	context: ReconcileContext;
}) => {
	const plan = computeReparentPlan({ context });
	await executeReparentPlan({ ctx, context, plan });
};
