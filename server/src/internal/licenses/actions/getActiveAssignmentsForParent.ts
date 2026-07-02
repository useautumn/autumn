import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { licenseAssignmentRepo } from "../repos/index.js";

export const getActiveAssignmentsForParent = async ({
	ctx,
	parentCustomerProductId,
}: {
	ctx: AutumnContext;
	parentCustomerProductId: string;
}) =>
	await licenseAssignmentRepo.listActiveWithProductByParentCustomerProductId({
		db: ctx.db,
		orgId: ctx.org.id,
		env: ctx.env,
		parentCustomerProductId,
	});

export type ActiveParentAssignment = Awaited<
	ReturnType<typeof getActiveAssignmentsForParent>
>[number];
