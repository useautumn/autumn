import { expect } from "bun:test";
import { type CusProductStatus, customerProducts } from "@autumn/shared";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext";
import { and, eq, isNull } from "drizzle-orm";

/** Asserts the released (entity-less) seat rows anchored to a pool link:
 * how many exist and the status they all carry. */
export const expectSpareSeatRowsCorrect = async ({
	ctx,
	customerLicenseLinkId,
	count,
	status,
}: {
	ctx: TestContext;
	customerLicenseLinkId: string;
	count: number;
	status: CusProductStatus;
}) => {
	const spareSeatRows = await ctx.db
		.select()
		.from(customerProducts)
		.where(
			and(
				eq(customerProducts.customer_license_link_id, customerLicenseLinkId),
				isNull(customerProducts.internal_entity_id),
			),
		);

	expect(spareSeatRows).toHaveLength(count);
	for (const spareSeatRow of spareSeatRows) {
		expect(spareSeatRow.status).toBe(status);
	}
};
