/**
 * Load test setup — creates products and 500 customers with Stripe payment methods.
 *
 * Run: cd server && bun loadtest:setup
 *   or: ENV_FILE=.env infisical run --env=dev -- bun perf/load-test/setup.ts
 */

import { loadLocalEnv } from "../../src/utils/envUtils.js";
loadLocalEnv();

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { ApiVersion, AppEnv, BillingInterval } from "@autumn/shared";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { createProducts } from "@tests/utils/productUtils.js";
import { initDrizzle } from "@/db/initDrizzle.js";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { constructPriceItem } from "@/internal/products/product-items/productItemUtils.js";
import { attachPaymentMethod } from "@/utils/scriptUtils/initCustomer.js";

const CUSTOMER_COUNT = 500;
const CUSTOMER_PREFIX = "load-cus-";
const BATCH_SIZE = 50;
const GROUP = "load-test";

function padNumber(n: number) {
	return String(n).padStart(3, "0");
}

async function main() {
	const { db } = initDrizzle();

	const orgSlug = process.env.TESTS_ORG;
	if (!orgSlug) {
		throw new Error("TESTS_ORG environment variable is required");
	}

	const org = await OrgService.getBySlug({ db, slug: orgSlug });
	if (!org) {
		throw new Error(`Org with slug "${orgSlug}" not found`);
	}

	const env = AppEnv.Sandbox;
	const stripeCli = createStripeCli({ org, env });
	const secretKey = process.env.UNIT_TEST_AUTUMN_SECRET_KEY;
	if (!secretKey) {
		throw new Error("UNIT_TEST_AUTUMN_SECRET_KEY is required");
	}

	const autumn = new AutumnInt({
		version: ApiVersion.V1_2,
		secretKey,
	});

	// ── 1. Create products ──────────────────────────────────────────

	console.log("Creating load test products...");

	const loadFree = products.base({
		id: "load-free",
		isDefault: true,
		group: GROUP,
		items: [items.dashboard(), items.monthlyMessages({ includedUsage: 100 })],
	});

	const loadPro = products.base({
		id: "load-pro",
		group: GROUP,
		items: [
			items.dashboard(),
			items.monthlyMessages({ includedUsage: 1000 }),
			constructPriceItem({ price: 20, interval: BillingInterval.Month }),
		],
	});

	const loadPremium = products.base({
		id: "load-premium",
		group: GROUP,
		items: [
			items.dashboard(),
			items.unlimitedMessages(),
			constructPriceItem({ price: 50, interval: BillingInterval.Month }),
		],
	});

	const loadMessages = products.oneOffAddOn({
		id: "load-messages",
		items: [items.oneOffMessages({ includedUsage: 500, price: 5 })],
	});

	await createProducts({
		db,
		orgId: org.id,
		env,
		autumn,
		products: [loadFree, loadPro, loadPremium, loadMessages],
	});

	console.log("  load-free (default), load-pro ($20/mo), load-premium ($50/mo), load-messages (add-on)");

	// ── 2. Create customers with Stripe payment methods ─────────────

	console.log(`\nCreating ${CUSTOMER_COUNT} customers with Stripe payment methods...`);

	const customerMap: Record<string, string> = {};
	let created = 0;

	for (let batch = 0; batch < CUSTOMER_COUNT; batch += BATCH_SIZE) {
		const batchEnd = Math.min(batch + BATCH_SIZE, CUSTOMER_COUNT);
		const promises = [];

		for (let i = batch + 1; i <= batchEnd; i++) {
			const customerId = `${CUSTOMER_PREFIX}${padNumber(i)}`;

			promises.push(
				(async () => {
					// Delete existing Autumn customer (idempotent re-runs)
					try {
						await autumn.customers.delete(customerId);
					} catch {}

					// Create Stripe customer
					const stripeCus = await stripeCli.customers.create({
						email: `${customerId}@loadtest.local`,
						name: `Load Test ${padNumber(i)}`,
					});

					// Attach payment method (tok_visa)
					await attachPaymentMethod({
						stripeCli,
						stripeCusId: stripeCus.id,
						type: "success",
					});

					// Create Autumn customer linked to Stripe, with default group
					await autumn.customers.create({
						id: customerId,
						name: `Load Test ${padNumber(i)}`,
						email: `${customerId}@loadtest.local`,
						stripe_id: stripeCus.id,
						internalOptions: {
							default_group: GROUP,
						},
					});

					customerMap[customerId] = stripeCus.id;
					created++;
				})(),
			);
		}

		await Promise.all(promises);
		console.log(`  ${created}/${CUSTOMER_COUNT} customers created`);
	}

	// ── 3. Write customer mapping ───────────────────────────────────

	const outputPath = join(import.meta.dir, ".customers.json");
	writeFileSync(outputPath, JSON.stringify(customerMap, null, 2));
	console.log(`\nWrote ${Object.keys(customerMap).length} customer mappings to .customers.json`);

	console.log("\nSetup complete! Run: bun loadtest:leak");
}

main()
	.catch((error) => {
		console.error("Setup failed:", error);
		process.exit(1);
	})
	.finally(() => {
		process.exit(0);
	});
