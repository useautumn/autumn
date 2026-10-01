/** Vercel rotate-secrets must accept any verified OIDC token.
 * Vercel sends `ADMIN` uppercase for user auth and no role at all for system auth. */

import { expect, test } from "bun:test";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import chalk from "chalk";
import {
	buildTestOidcHeaders,
	seedVercelCustomer,
	seedVercelResource,
	setupVercelOrg,
} from "./utils/vercel-test-helpers";

const TEST_CASE = "vrot";

const rotateUrl = ({
	installationId,
	resourceId,
}: {
	installationId: string;
	resourceId: string;
}) =>
	`${(process.env.AUTUMN_TEST_BASE_URL ?? "http://localhost:8080").replace(/\/$/, "")}/webhooks/vercel/${ctx.org.id}/${ctx.env}/v1/installations/${installationId}/resources/${resourceId}/secrets/rotate`;

for (const authType of ["system", "user"] as const) {
	test.concurrent(
		`${chalk.yellowBright(`vercel-rotate-secrets: ${authType} auth rotation is accepted`)}`,
		async () => {
			const installationId = `icfg_${TEST_CASE}_${authType}`;
			const resourceId = `vre_${TEST_CASE}_${authType}`;

			await setupVercelOrg(ctx);
			await seedVercelCustomer({
				ctx,
				customerId: `${TEST_CASE}-${authType}-customer`,
				installationId,
			});
			await seedVercelResource({ ctx, resourceId, installationId });

			const response = await fetch(rotateUrl({ installationId, resourceId }), {
				method: "POST",
				headers: buildTestOidcHeaders(installationId, authType),
				body: JSON.stringify({
					reason: "final rotation",
					delayOldSecretsExpirationHours: 1,
				}),
			});

			expect(response.status).toBe(200);
			expect(await response.json()).toEqual({ sync: false });
		},
	);
}
