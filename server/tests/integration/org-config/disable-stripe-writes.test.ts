/**
 * disable_stripe_writes org config
 *
 * The setting only applies in live: orgDisableStripeWrites returns false in
 * sandbox, so sandbox attaches keep creating Stripe customers.
 */

import { expect, test } from "bun:test";
import {
	AppEnv,
	type AttachParamsV0Input,
	orgDisableStripeWrites,
} from "@autumn/shared";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { db } from "@/db/initDrizzle";
import { CusService } from "@/internal/customers/CusService";
import { OrgService } from "@/internal/orgs/OrgService";

test.concurrent(
	`${chalk.yellowBright("disable stripe writes: no-op in sandbox, applies in live")}`,
	async () => {
		const customerId = "disable-stripe-writes";

		const freeProduct = products.base({
			id: "free",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { ctx, autumnV1 } = await initScenario({
			setup: [s.deleteCustomer({ customerId })],
			actions: [s.products({ list: [freeProduct] })],
		});

		const disabledConfig = { ...ctx.org.config, disable_stripe_writes: true };

		await OrgService.update({
			db: db,
			orgId: ctx.org.id,
			updates: { config: disabledConfig },
		});

		try {
			const disabledOrg = { ...ctx.org, config: disabledConfig };
			expect(
				orgDisableStripeWrites({
					ctx: { ...ctx, org: disabledOrg, env: AppEnv.Sandbox },
				}),
			).toBe(false);
			expect(
				orgDisableStripeWrites({
					ctx: { ...ctx, org: disabledOrg, env: AppEnv.Live },
				}),
			).toBe(true);

			await autumnV1.customers.create({
				id: customerId,
				name: "Disable Stripe Writes Customer",
				email: `${customerId}@example.com`,
				internalOptions: {
					disable_defaults: true,
				},
			});

			await autumnV1.billing.attach<AttachParamsV0Input>({
				customer_id: customerId,
				product_id: freeProduct.id,
			});

			const customer = await CusService.get({
				db: db,
				idOrInternalId: customerId,
				orgId: ctx.org.id,
				env: ctx.env,
			});

			expect(ctx.env).toBe(AppEnv.Sandbox);
			expect(customer?.processor?.id).toBeTruthy();
			const apiCustomer = await autumnV1.customers.get(customerId);
			expect(apiCustomer?.stripe_id).toBe(customer?.processor?.id);
		} finally {
			await OrgService.update({
				db: db,
				orgId: ctx.org.id,
				updates: {
					config: { ...ctx.org.config, disable_stripe_writes: false },
				},
			});
		}
	},
);
