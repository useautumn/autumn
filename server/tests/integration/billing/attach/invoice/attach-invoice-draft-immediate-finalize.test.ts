/**
 * Invoice mode, draft + enable_plan_immediately: the plan is pending while the
 * invoice is a draft and activates once it is finalized, before payment.
 * Stripe-side finalization is covered in attach-invoice-draft-immediate.test.ts.
 *
 * Contract:
 *   invoices.finalize           → plan active via invoice.finalized, deferred metadata deleted
 *   later invoices.pay          → no second activation (balance unchanged)
 *   credit balance covers total → finalize pays instantly; finalized + paid race, plan activates once
 *   reissued draft              → the replacement's finalize activates the plan
 */

import { expect, test } from "bun:test";
import {
	ALL_STATUSES,
	type ApiCustomerV3,
	type ApiListInvoiceV1,
	type AttachParamsV1Input,
	CusProductStatus,
} from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectProductActive } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { pollUntilAsserted } from "@tests/utils/genUtils";
import { WEBHOOK_SETTLE_TIMEOUT_MS } from "@tests/utils/pollableCustomerExpect";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { CusService } from "@/internal/customers/CusService";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";
import { MetadataService } from "@/internal/metadata/MetadataService";

type Scenario = Pick<
	Awaited<ReturnType<typeof initScenario>>,
	"autumnV1" | "autumnV2_3" | "autumnV2_4"
> & { internalCustomerId: string; stripeCustomerId: string; planId: string };
type InvoiceResponse = { invoice: ApiListInvoiceV1 };

const setupDraftImmediate = async ({
	customerId,
	planId,
}: {
	customerId: string;
	planId: string;
}) => {
	const pro = products.base({
		id: planId,
		items: [
			items.monthlyMessages({ includedUsage: 100 }),
			items.monthlyPrice({ price: 20 }),
		],
	});
	const { autumnV1, autumnV2_3, autumnV2_4 } = await initScenario({
		customerId,
		setup: [s.customer({ testClock: false }), s.products({ list: [pro] })],
		actions: [],
	});
	const customer = await CusService.get({
		db: ctx.db,
		idOrInternalId: customerId,
		orgId: ctx.org.id,
		env: ctx.env,
	});
	const scenario: Scenario = {
		autumnV1,
		autumnV2_3,
		autumnV2_4,
		internalCustomerId: customer?.internal_id ?? "",
		stripeCustomerId: customer?.processor?.id ?? "",
		// initScenario prefixes the product id.
		planId: pro.id,
	};
	return scenario;
};

const attachDraftImmediate = async ({
	scenario,
	customerId,
	planId,
}: {
	scenario: Scenario;
	customerId: string;
	planId: string;
}) => {
	await scenario.autumnV2_4.billing.attach<AttachParamsV1Input>({
		customer_id: customerId,
		plan_id: planId,
		invoice_mode: {
			enabled: true,
			finalize: false,
			enable_plan_immediately: true,
		},
	});
	const { list } = (await scenario.autumnV2_3.post("/invoices.list", {
		customer_id: customerId,
	})) as { list: ApiListInvoiceV1[] };
	expect(list[0].status).toBe("draft");
	return list[0];
};

const listPlanRows = async ({
	scenario,
	planId,
}: {
	scenario: Scenario;
	planId: string;
}) =>
	(
		await CusProductService.list({
			db: ctx.db,
			internalCustomerId: scenario.internalCustomerId,
			inStatuses: ALL_STATUSES,
		})
	).filter((customerProduct) => customerProduct.product.id === planId);

const expectPendingPlan = async ({
	scenario,
	planId,
}: {
	scenario: Scenario;
	planId: string;
}) => {
	const rows = await listPlanRows({ scenario, planId });
	expect(rows).toHaveLength(1);
	expect(rows[0].status).toBe(CusProductStatus.Pending);
	expect(rows[0].metadata_id).toBeTruthy();
	return rows[0];
};

const expectPlanActivatedOnce = async ({
	scenario,
	customerId,
	planId,
	metadataId,
}: {
	scenario: Scenario;
	customerId: string;
	planId: string;
	metadataId: string;
}) => {
	await expectProductActive({
		autumn: scenario.autumnV1,
		customerId,
		settleTimeoutMs: WEBHOOK_SETTLE_TIMEOUT_MS,
		productId: planId,
	});

	const rows = await listPlanRows({ scenario, planId });
	expect(rows).toHaveLength(1);
	expect(rows[0].status).toBe(CusProductStatus.Active);
	expect(await MetadataService.get({ db: ctx.db, id: metadataId })).toBeFalsy();

	const customer =
		await scenario.autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 100,
		balance: 100,
		usage: 0,
	});
};

test.concurrent(
	`${chalk.yellowBright("draft-imm finalize: invoices.finalize activates the pending plan, later pay is a no-op")}`,
	async () => {
		const customerId = "draft-imm-autumn-finalize";
		const productId = "pro-draft-imm-autumn-finalize";
		const scenario = await setupDraftImmediate({
			customerId,
			planId: productId,
		});
		const { planId } = scenario;

		const draft = await attachDraftImmediate({ scenario, customerId, planId });
		const pending = await expectPendingPlan({ scenario, planId });

		const { invoice } = (await scenario.autumnV2_3.post("/invoices.finalize", {
			invoice_id: draft.id,
		})) as InvoiceResponse;
		expect(invoice.status).toBe("open");

		await expectPlanActivatedOnce({
			scenario,
			customerId,
			planId,
			metadataId: pending.metadata_id ?? "",
		});

		const paid = (await scenario.autumnV2_3.post("/invoices.pay", {
			invoice_id: draft.id,
		})) as InvoiceResponse;
		expect(paid.invoice.status).toBe("paid");

		await expectPlanActivatedOnce({
			scenario,
			customerId,
			planId,
			metadataId: pending.metadata_id ?? "",
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("draft-imm finalize: credit balance pays on finalize, plan activates exactly once")}`,
	async () => {
		const customerId = "draft-imm-credit-balance";
		const productId = "pro-draft-imm-credit-balance";
		const scenario = await setupDraftImmediate({
			customerId,
			planId: productId,
		});
		const { planId } = scenario;

		const draft = await attachDraftImmediate({ scenario, customerId, planId });
		const pending = await expectPendingPlan({ scenario, planId });

		await ctx.stripeCli.customers.createBalanceTransaction(
			scenario.stripeCustomerId,
			{ amount: -5000, currency: "usd" },
		);

		// invoice.finalized and invoice.paid now fire back to back.
		const finalized = await ctx.stripeCli.invoices.finalizeInvoice(
			draft.stripe_id,
		);
		expect(finalized.status).toBe("paid");

		await expectPlanActivatedOnce({
			scenario,
			customerId,
			planId,
			metadataId: pending.metadata_id ?? "",
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("draft-imm finalize: reissued draft activates through the replacement invoice")}`,
	async () => {
		const customerId = "draft-imm-reissue";
		const productId = "pro-draft-imm-reissue";
		const scenario = await setupDraftImmediate({
			customerId,
			planId: productId,
		});
		const { planId } = scenario;

		const draft = await attachDraftImmediate({ scenario, customerId, planId });
		const pending = await expectPendingPlan({ scenario, planId });

		const { invoice: replacement } = (await scenario.autumnV2_3.post(
			"/invoices.reissue",
			{ invoice_id: draft.id },
		)) as InvoiceResponse;
		expect(replacement.status).toBe("open");

		await expectPlanActivatedOnce({
			scenario,
			customerId,
			planId,
			metadataId: pending.metadata_id ?? "",
		});

		// The parked original stays a draft and never activates anything on its own.
		await pollUntilAsserted({
			fetch: () => ctx.stripeCli.invoices.retrieve(draft.stripe_id),
			assert: (original) => {
				expect(original.status).toBe("draft");
				expect(original.metadata?.autumn_reissued_to).toBe(
					replacement.stripe_id,
				);
			},
		});
	},
);
