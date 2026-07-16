import { expect } from "bun:test";
import { CusProductStatus } from "@autumn/shared";
import { getLicenseDbState } from "@tests/integration/licenses/licenseTestUtils";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext";

/** DB-level anchor check: every live seat's link resolves to a pool owned by
 * the customer's ACTIVE parent customer product for the given plan. */
export const expectAssignmentsAnchoredToParent = async ({
	ctx,
	customerId,
	parentPlanId,
	count,
}: {
	ctx: TestContext;
	customerId: string;
	parentPlanId: string;
	count: number;
}) => {
	const { assignments, pools, products } = await getLicenseDbState({
		db: ctx.db,
		customerId,
	});

	const activeParent = products.find(
		(product) =>
			product.product_id === parentPlanId &&
			product.status === CusProductStatus.Active &&
			!product.customer_license_link_id,
	);
	expect(activeParent, `active parent ${parentPlanId} exists`).toBeDefined();

	const liveAssignments = assignments.filter(
		(assignment) =>
			assignment.internal_entity_id &&
			assignment.status === CusProductStatus.Active,
	);
	expect(liveAssignments).toHaveLength(count);

	for (const assignment of liveAssignments) {
		// Predecessor pools linger on expired parents and share the link —
		// the anchor contract is that A pool on the ACTIVE parent carries it.
		const linkPools = pools.filter(
			(candidate) => candidate.link_id === assignment.customer_license_link_id,
		);
		expect(
			linkPools.some(
				(pool) => pool.parent_customer_product_id === activeParent?.id,
			),
			`seat ${assignment.id} anchors to the active parent's pool`,
		).toBe(true);
	}
};
