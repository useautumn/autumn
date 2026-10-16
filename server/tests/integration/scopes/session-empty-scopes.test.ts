/**
 * Dashboard sessions with no scopes fail closed.
 *
 * Contract:
 * - A session whose org role grants no scopes (an unknown role) gets 403 insufficient_scopes
 *   on scope-gated routes, instead of the legacy fail-open meant for old API keys.
 * - Routes declared `Scopes.Public` still answer for that session.
 * - Built-in roles are unaffected.
 */

import { expect, test } from "bun:test";
import { ErrCode } from "@autumn/shared";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import {
	createDashboardSession,
	dashboardFetch,
} from "@tests/utils/testInitUtils/dashboardSession.js";
import chalk from "chalk";

const asDashboard = { headers: { "x-client-type": "dashboard" } };

test(`${chalk.yellowBright("session scopes: an unknown role is denied, public routes still answer")}`, async () => {
	const unknownRole = await createDashboardSession(ctx, {
		role: "retired_role",
	});
	const builtIn = await createDashboardSession(ctx, { role: "member" });

	try {
		const denied = await dashboardFetch<{ code: string }>(
			ctx,
			unknownRole,
			"/v1/customers",
			asDashboard,
		);
		expect(denied).toMatchObject({
			status: 403,
			data: { code: ErrCode.InsufficientScopes },
		});

		const publicRoute = await dashboardFetch(ctx, unknownRole, "/saved_views");
		expect(publicRoute.status).toBe(200);

		const allowed = await dashboardFetch(
			ctx,
			builtIn,
			"/v1/customers",
			asDashboard,
		);
		expect(allowed.status).toBe(200);
	} finally {
		await Promise.all([unknownRole.cleanup(), builtIn.cleanup()]);
	}
});
