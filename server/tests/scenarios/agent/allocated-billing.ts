import { AppEnv } from "@autumn/shared";
import { forceOldAllocatedV1Config } from "@tests/integration/crud/plans/utils/allocatedV1Utils";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { clearOrg } from "@tests/utils/setup/clearOrg.js";
import { ensureV2Features } from "@tests/utils/setup/setupOrg.js";
import {
	createTestContext,
	type TestContext,
} from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";

const GROUP = "allocated-billing";

export const seedAllocatedBillingCatalog = async ({
	ctx,
}: {
	ctx: TestContext;
}) => {
	await ensureV2Features({ db: ctx.db, orgId: ctx.org.id, env: ctx.env });

	const legacy = products.pro({
		id: "seats_legacy",
		items: [items.allocatedUsers({ includedUsage: 1 })],
	});
	const arrear = products.pro({
		id: "seats_arrear",
		items: [items.allocatedV2Users({ includedUsage: 1 })],
	});

	await initScenario({
		setup: [
			s.products({
				list: [legacy, arrear].map((plan) => ({ ...plan, group: GROUP })),
				prefix: "",
				createInStripe: false,
			}),
		],
		actions: [],
		ctx,
	});
	await forceOldAllocatedV1Config({ ctx, planId: legacy.id });

	return { legacy: legacy.id, arrear: arrear.id, group: GROUP };
};

export const runAllocatedBillingSeed = async () => {
	if (!process.env.TESTS_ORG) {
		throw new Error("TESTS_ORG is required to seed allocated billing data");
	}
	if (!process.argv.includes("--skip-clear")) {
		await clearOrg({
			orgSlug: process.env.TESTS_ORG,
			env: AppEnv.Sandbox,
			skipStripeReset: true,
		});
	}

	const ctx = await createTestContext();
	const result = await seedAllocatedBillingCatalog({ ctx });
	console.log("Allocated billing seed complete", result);
};

if (import.meta.main) {
	runAllocatedBillingSeed()
		.catch((error) => {
			console.error("Allocated billing seed failed:", error);
			process.exit(1);
		})
		.finally(() => {
			process.exit(0);
		});
}
