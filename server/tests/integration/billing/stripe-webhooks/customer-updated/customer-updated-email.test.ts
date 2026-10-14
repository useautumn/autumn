import { expect, test } from "bun:test";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { CusService } from "@/internal/customers/CusService.js";
import {
	expectCustomerDetails,
	getStripeCustomerId,
	updateStripeCustomerAndWait,
} from "./customerUpdatedTestUtils.js";

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
			name: customerId,
		});
	},
);

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
			email: `${customerId}@example.com`,
		});
	},
);

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

test.concurrent(
	`${chalk.yellowBright("customer.updated: cleared name/email do not clobber Autumn")}`,
	async () => {
		const customerId = "cus-updated-cleared";

		const { autumnV1, customer, ctx } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: false })],
			actions: [],
		});

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
