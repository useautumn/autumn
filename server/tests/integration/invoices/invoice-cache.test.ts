import { expect, test } from "bun:test";
import { buildCustomerInvoicesCacheKey } from "@autumn/cache";
import {
	type ApiCustomerV3,
	type ApiListInvoiceV1,
	InvoiceStatus,
} from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { isBalanceWorkerRoute } from "@tests/utils/balanceWorkerRouteTestUtils";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { getMiscRedis } from "@/external/redis/miscCache/getMiscRedis";
import { CusService } from "@/internal/customers/CusService";
import { readCachedCustomerInvoices } from "@/internal/invoices/actions/readCachedCustomerInvoices";

test.concurrent(
	`${chalk.yellowBright("invoice cache: a read fills the key, an inline pay drops it")}`,
	async () => {
		const customerId = "inv-cache-pay";
		const pro = products.pro({
			id: "pro-inv-cache",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const { ctx, autumnV1, autumnV2_3 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [],
		});

		const attached = await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: pro.id,
			invoice: true,
			finalize_invoice: true,
			enable_product_immediately: true,
			redirect_mode: "if_required",
		});
		expect(attached.invoice!.status).toBe("open");

		const customer = await CusService.get({
			db: ctx.db,
			idOrInternalId: customerId,
			orgId: ctx.org.id,
			env: ctx.env,
		});
		const internalCustomerId = customer!.internal_id;
		const key = buildCustomerInvoicesCacheKey({ internalCustomerId });

		await getMiscRedis().del(key);
		const firstRead = await readCachedCustomerInvoices({
			ctx,
			internalCustomerId,
		});
		expect(firstRead.map(({ status }) => status)).toEqual([InvoiceStatus.Open]);
		expect(await getMiscRedis().exists(key)).toBe(1);

		expect(
			await readCachedCustomerInvoices({ ctx, internalCustomerId }),
		).toEqual(firstRead);

		const { list } = (await autumnV2_3.post("/invoices.list", {
			customer_id: customerId,
		})) as { list: ApiListInvoiceV1[] };
		await autumnV2_3.post("/invoices.pay", { invoice_id: list[0].id });

		expect(await getMiscRedis().exists(key)).toBe(0);
		const freshRead = await readCachedCustomerInvoices({
			ctx,
			internalCustomerId,
		});
		expect(freshRead.map(({ status }) => status)).toEqual([InvoiceStatus.Paid]);
		expect(await getMiscRedis().exists(key)).toBe(1);

		if (!isBalanceWorkerRoute()) return;
		const apiCustomer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerInvoiceCorrect({
			customer: apiCustomer,
			count: 1,
			latestStatus: "paid",
		});
	},
	90_000,
);
