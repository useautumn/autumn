/**
 * TDD test for syncing a Stripe customer's name + email to Autumn on `customer.updated`.
 *
 * Contract under test:
 *   New behaviors (applied independently to `name` and `email`):
 *     - customer.updated with a changed, non-empty value -> Autumn customer field
 *       updated to match Stripe.
 *     - a field that did not change is left untouched (changing email never rewrites
 *       name, and vice versa).
 *     - customer.updated where nothing relevant changed (e.g. metadata-only) -> no-op.
 *     - customer.updated where a value is cleared (empty/null) in Stripe -> existing
 *       Autumn value preserved (no clobber).
 *     - customer.updated for a Stripe customer with no linked Autumn customer
 *       -> no-op, no crash.
 *   Side effects:
 *     - customers.name / customers.email columns updated; FullCustomer cache
 *       invalidated so the API reflects the change.
 *   Config:
 *     - customer.updated handled by handleStripeCustomerUpdated (in
 *       MAIN_STRIPE_EVENT_TYPES / "core").
 *
 * Pre-impl (name) red: the name-sync assertions fail because the handler only syncs
 * email. The guard assertions hold pre-impl and protect against over-reaching.
 */

import { expect, test } from "bun:test";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { CusService } from "@/internal/customers/CusService.js";
import {
	expectCustomerDetails,
	getStripeCustomerId,
	updateStripeCustomerAndWait,
} from "./customerUpdatedTestUtils.js";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: changed email syncs; the unchanged name is left alone
// ═══════════════════════════════════════════════════════════════════════════════
test.concurrent(
	`${chalk.yellowBright("customer.updated: changed email syncs (name untouched)")}`,
	async () => {
		const customerId = "cus-updated-email-sync";

		const { autumnV1, customer, ctx } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: false })],
			actions: [],
		});

		const newEmail = `${customerId}-updated@example.com`;
		await updateStripeCustomerAndWait({
			ctx,
			stripeCustomerId: getStripeCustomerId(customer),
			update: { email: newEmail },
		});

		await expectCustomerDetails({
			autumn: autumnV1,
			customerId,
			email: newEmail,
			name: customerId, // initCustomerV3 default name; must be untouched
		});
	},
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: changed name syncs; the unchanged email is left alone
// ═══════════════════════════════════════════════════════════════════════════════
test.concurrent(
	`${chalk.yellowBright("customer.updated: changed name syncs (email untouched)")}`,
	async () => {
		const customerId = "cus-updated-name-sync";

		const { autumnV1, customer, ctx } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: false })],
			actions: [],
		});

		const newName = "Renamed Customer";
		await updateStripeCustomerAndWait({
			ctx,
			stripeCustomerId: getStripeCustomerId(customer),
			update: { name: newName },
		});

		await expectCustomerDetails({
			autumn: autumnV1,
			customerId,
			name: newName,
			email: `${customerId}@example.com`, // unchanged
		});
	},
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: name + email both change -> both sync in one event
// ═══════════════════════════════════════════════════════════════════════════════
test.concurrent(
	`${chalk.yellowBright("customer.updated: name and email both sync")}`,
	async () => {
		const customerId = "cus-updated-both-sync";

		const { autumnV1, customer, ctx } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: false })],
			actions: [],
		});

		const newName = "Both Changed";
		const newEmail = `${customerId}-both@example.com`;
		await updateStripeCustomerAndWait({
			ctx,
			stripeCustomerId: getStripeCustomerId(customer),
			update: { name: newName, email: newEmail },
		});

		await expectCustomerDetails({
			autumn: autumnV1,
			customerId,
			name: newName,
			email: newEmail,
		});
	},
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4: no-op — a metadata-only change touches neither name nor email
// ═══════════════════════════════════════════════════════════════════════════════
test.concurrent(
	`${chalk.yellowBright("customer.updated: metadata-only change is a no-op")}`,
	async () => {
		const customerId = "cus-updated-metadata-only";

		const { autumnV1, customer, ctx } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: false })],
			actions: [],
		});

		await updateStripeCustomerAndWait({
			ctx,
			stripeCustomerId: getStripeCustomerId(customer),
			update: { metadata: { changed: "true" } },
		});

		await expectCustomerDetails({
			autumn: autumnV1,
			customerId,
			name: customerId,
			email: `${customerId}@example.com`,
		});
	},
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 5: guard — cleared name/email in Stripe do NOT clobber Autumn values
// ═══════════════════════════════════════════════════════════════════════════════
test.concurrent(
	`${chalk.yellowBright("customer.updated: cleared name/email do not clobber Autumn")}`,
	async () => {
		const customerId = "cus-updated-cleared";

		const { autumnV1, customer, ctx } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: false })],
			actions: [],
		});

		// Empty strings clear both fields on the Stripe customer (object -> null).
		await updateStripeCustomerAndWait({
			ctx,
			stripeCustomerId: getStripeCustomerId(customer),
			update: { name: "", email: "" },
		});

		await expectCustomerDetails({
			autumn: autumnV1,
			customerId,
			name: customerId,
			email: `${customerId}@example.com`,
		});
	},
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 6: robustness — customer.updated for an unlinked Stripe customer is a no-op
// ═══════════════════════════════════════════════════════════════════════════════
test.concurrent(
	`${chalk.yellowBright("customer.updated: unlinked Stripe customer is a safe no-op")}`,
	async () => {
		const { ctx } = await initScenario({ setup: [], actions: [] });

		const orphan = await ctx.stripeCli.customers.create({
			name: "Orphan Before",
			email: "orphan-before@example.com",
		});

		try {
			await updateStripeCustomerAndWait({
				ctx,
				stripeCustomerId: orphan.id,
				update: { name: "Orphan After", email: "orphan-after@example.com" },
			});

			const linked = await CusService.getByStripeId({
				ctx,
				stripeId: orphan.id,
			});
			expect(linked).toBeNull();
		} finally {
			await ctx.stripeCli.customers.del(orphan.id).catch(() => {});
		}
	},
);
