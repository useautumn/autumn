/**
 * TDD test for duplicate organizations in the OAuth consent selector.
 * Red returns one organization per membership; green returns each organization once.
 */

import { expect, test } from "bun:test";
import { member } from "@autumn/shared";
import defaultCtx from "@tests/utils/testInitUtils/createTestContext.js";
import {
	createDashboardSession,
	dashboardGet,
} from "@tests/utils/testInitUtils/dashboardSession.js";
import { initDrizzle } from "@/db/initDrizzle.js";
import { generateId } from "@/utils/genUtils.js";

const { db } = initDrizzle();

test("organization list deduplicates multiple memberships for the same organization", async () => {
	const session = await createDashboardSession(defaultCtx);

	try {
		await db.insert(member).values({
			id: generateId("mem"),
			organizationId: defaultCtx.org.id,
			userId: session.userId,
			role: "owner",
			createdAt: new Date(),
		});

		const response = await dashboardGet<Array<{ id: string }>>(
			defaultCtx,
			session,
			"/api/auth/organization/list",
		);

		expect(response.status).toBe(200);
		expect(response.data.filter((org) => org.id === defaultCtx.org.id)).toHaveLength(
			1,
		);
	} finally {
		await session.cleanup();
	}
});
