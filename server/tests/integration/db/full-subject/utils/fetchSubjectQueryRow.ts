import type { CusProductStatus, SubjectQueryRow } from "@autumn/shared";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext.js";
import { RELEVANT_STATUSES } from "@/internal/customers/cusProducts/CusProductService.js";
import { getFullSubjectQuery } from "@/internal/customers/repos/getFullSubject/index.js";
import { unpackSubjectEnvelope } from "@/internal/customers/repos/getFullSubject/unpackSubjectEnvelope.js";

export const fetchSubjectQueryRow = async ({
	ctx,
	customerId,
	entityId,
	inStatuses = RELEVANT_STATUSES,
}: {
	ctx: TestContext;
	customerId?: string;
	entityId?: string;
	inStatuses?: CusProductStatus[];
}): Promise<SubjectQueryRow | null> => {
	const result = await ctx.db.execute(
		getFullSubjectQuery({
			orgId: ctx.org.id,
			env: ctx.env,
			customerId,
			entityId,
			inStatuses,
		}),
	);

	return unpackSubjectEnvelope({ rows: result })[0] ?? null;
};
