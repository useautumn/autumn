/**
 * Draft + enable-immediately edge cases: the pending plan must activate exactly
 * once, and a deleted draft must release its pending plan.
 */

import { expect, test } from "bun:test";
import {
	ALL_STATUSES,
	type ApiCustomerV3,
	CusProductStatus,
} from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { pollUntilAsserted } from "@tests/utils/genUtils";
import { WEBHOOK_SETTLE_TIMEOUT_MS } from "@tests/utils/pollableCustomerExpect";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { executeDeferredInvoicePlanOnce } from "@/internal/billing/v2/execute/executeDeferredInvoicePlanOnce";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";
import { MetadataService } from "@/internal/metadata/MetadataService";

type ScenarioContext = Awaited<ReturnType<typeof initScenario>>["ctx"];

const listProductRows = async ({
	ctx,
	internalCustomerId,
	productId,
}: {
	ctx: ScenarioContext;
	internalCustomerId: string;
	productId: string;
}) => {
	const customerProducts = await CusProductService.list({
		db: ctx.db,
		internalCustomerId,
		inStatuses: ALL_STATUSES,
	});
	return customerProducts.filter(
		(customerProduct) => customerProduct.product.id === productId,
	);
};

const expectSingleActiveRow = async ({
	ctx,
	internalCustomerId,
	productId,
}: {
	ctx: ScenarioContext;
	internalCustomerId: string;
	productId: string;
}) => {
	const rows = await listProductRows({ ctx, internalCustomerId, productId });
	expect(rows).toHaveLength(1);
	expect(rows[0].status).toBe(CusProductStatus.Active);
	expect(rows[0].metadata_id).toBeNull();
};

const setupDraftPendingPro = async ({ customerId }: { customerId: string }) => {
	const pro = products.base({
		id: "pro",
		items: [
			items.monthlyMessages({ includedUsage: 100 }),
			items.monthlyPrice({ price: 20 }),
		],
	});

	const scenario = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: false, paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.billing.attach({
				productId: pro.id,
				invoice: true,
				enableProductImmediately: true,
				finalizeInvoice: false,
			}),
		],
	});

	const internalCustomerId = scenario.customer?.internal_id ?? "";
	const [pendingRow] = await listProductRows({
		ctx: scenario.ctx,
		internalCustomerId,
		productId: pro.id,
	});
	expect(pendingRow?.status).toBe(CusProductStatus.Pending);

	const metadata = await MetadataService.get({
		db: scenario.ctx.db,
		id: pendingRow.metadata_id ?? "",
	});

	return { ...scenario, pro, internalCustomerId, metadata: metadata! };
};

test.concurrent(
	`${chalk.yellowBright("draft-pending edge 1: finalizing then paying activates once")}`,
	async () => {
		const customerId = "draft-pending-edge-finalize-then-pay";
		const { ctx, autumnV1, pro, internalCustomerId, metadata } =
			await setupDraftPendingPro({ customerId });

		await ctx.stripeCli.invoices.finalizeInvoice(metadata.stripe_invoice_id!);
		await expectCustomerProducts({
			autumn: autumnV1,
			customerId,
			settleTimeoutMs: WEBHOOK_SETTLE_TIMEOUT_MS,
			active: [pro.id],
		});

		const paidInvoice = await ctx.stripeCli.invoices.pay(
			metadata.stripe_invoice_id!,
		);
		expect(paidInvoice.status).toBe("paid");

		await pollUntilAsserted({
			fetch: () => autumnV1.customers.get<ApiCustomerV3>(customerId),
			assert: (customer) => expect(customer.invoices?.[0]?.status).toBe("paid"),
			timeoutMs: WEBHOOK_SETTLE_TIMEOUT_MS,
		});

		await expectSingleActiveRow({ ctx, internalCustomerId, productId: pro.id });
		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		expectCustomerFeatureCorrect({
			customer,
			featureId: TestFeature.Messages,
			includedUsage: 100,
			balance: 100,
			usage: 0,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("draft-pending edge 2: concurrent resumes execute the plan once")}`,
	async () => {
		const customerId = "draft-pending-edge-concurrent-resume";
		const { ctx, autumnV1, pro, internalCustomerId, metadata } =
			await setupDraftPendingPro({ customerId });

		const stripeInvoice = await ctx.stripeCli.invoices.retrieve(
			metadata.stripe_invoice_id!,
		);

		await Promise.all([
			executeDeferredInvoicePlanOnce({ ctx, metadata, stripeInvoice }),
			executeDeferredInvoicePlanOnce({ ctx, metadata, stripeInvoice }),
		]);

		await expectSingleActiveRow({ ctx, internalCustomerId, productId: pro.id });
		expect(
			await MetadataService.get({ db: ctx.db, id: metadata.id }),
		).toBeFalsy();

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		expectCustomerFeatureCorrect({
			customer,
			featureId: TestFeature.Messages,
			includedUsage: 100,
			balance: 100,
			usage: 0,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("draft-pending edge 3: deleting a one-off draft expires the pending plan")}`,
	async () => {
		const customerId = "draft-pending-edge-deleted-draft";
		const oneOff = products.oneOff({
			id: "one-off-credits",
			items: [
				items.oneOffMessages({
					includedUsage: 0,
					billingUnits: 100,
					price: 10,
				}),
			],
		});

		const {
			ctx,
			autumnV1,
			customer: scenarioCustomer,
		} = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false, paymentMethod: "success" }),
				s.products({ list: [oneOff] }),
			],
			actions: [],
		});
		const internalCustomerId = scenarioCustomer?.internal_id ?? "";

		const result = await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: oneOff.id,
			options: [{ feature_id: TestFeature.Messages, quantity: 100 }],
			invoice: true,
			finalize_invoice: false,
			enable_product_immediately: true,
			redirect_mode: "if_required",
		});
		expect(result.invoice?.status).toBe("draft");

		await ctx.stripeCli.invoices.del(result.invoice!.stripe_id);

		await pollUntilAsserted({
			fetch: () =>
				listProductRows({ ctx, internalCustomerId, productId: oneOff.id }),
			assert: (rows) => {
				expect(rows).toHaveLength(1);
				expect(rows[0].status).toBe(CusProductStatus.Expired);
				expect(rows[0].metadata_id).toBeNull();
			},
			timeoutMs: WEBHOOK_SETTLE_TIMEOUT_MS,
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		expect(customer.features?.[TestFeature.Messages]).toBeUndefined();
	},
);
