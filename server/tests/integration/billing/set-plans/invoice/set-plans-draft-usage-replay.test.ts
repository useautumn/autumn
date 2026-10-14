/**
 * A set_plans draft that also bills accrued usage, issued one draft at a time.
 *
 * Setup: pro ($20/mo, 100 messages, $0.10 over) attached without billing, 150 messages tracked,
 * then re-listed by set_plans in invoice mode with issue_method draft.
 *
 * Red (before): finalizing the accrued-usage draft created the subscription with its own draft
 *   invoice; finalizing that one replayed the whole plan from the invoice stage, so a second
 *   $5 usage invoice was created.
 *   The first resume also activated the plan while the subscription's invoice was still a draft,
 *   so the replay inserted the customer_product again and the webhook failed.
 * Green (after): a resume that defers again stores the subscription draft's lines and hands the
 *   pending plan to the new deferral, and resuming after the subscription stage skips the invoice
 *   stage, so the usage is billed once and the plan stays pending until the second finalize
 *   activates it. The second finalize still activates the plan when the hand-off hasn't landed.
 */

import { expect, test } from "bun:test";
import {
	type ApiListInvoiceV1,
	CusProductStatus,
	customerProducts,
	MetadataType,
	type SetPlansParamsV0Input,
} from "@autumn/shared";
import { expectPlanStatus } from "@tests/integration/billing/utils/expectInvoiceIssueMethodCorrect";
import { listInvoices } from "@tests/integration/invoices/issue-method/utils/issueMethodTestUtils";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { pollUntilAsserted, timeout } from "@tests/utils/genUtils";
import { WEBHOOK_SETTLE_TIMEOUT_MS } from "@tests/utils/pollableCustomerExpect";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { and, eq } from "drizzle-orm";
import { CusService } from "@/internal/customers/CusService";
import { MetadataService } from "@/internal/metadata/MetadataService";

const OVERAGE_TOTAL = 5;
const BASE_PRICE = 20;

const messagesLineAmounts = async ({
	invoices,
}: {
	invoices: ApiListInvoiceV1[];
}) => {
	const stripeInvoices = await Promise.all(
		invoices.map((invoice) =>
			ctx.stripeCli.invoices.retrieve(invoice.stripe_id),
		),
	);
	return stripeInvoices.flatMap((invoice) =>
		invoice.lines.data
			.filter((line) => /messages/i.test(line.description ?? ""))
			.map((line) => line.amount / 100),
	);
};

/** Finalizes the invoice, then waits until its pending plan has been carried out. */
const finalizeAndSettle = async ({
	autumnV2_3,
	invoice,
}: {
	autumnV2_3: Awaited<ReturnType<typeof initScenario>>["autumnV2_3"];
	invoice: ApiListInvoiceV1;
}) => {
	await autumnV2_3.post("/invoices.finalize", { invoice_id: invoice.id });
	await pollUntilAsserted({
		timeoutMs: WEBHOOK_SETTLE_TIMEOUT_MS,
		fetch: () =>
			MetadataService.getByStripeInvoiceId({
				db: ctx.db,
				stripeInvoiceId: invoice.stripe_id,
				type: MetadataType.DeferredInvoice,
			}),
		assert: (metadata) => expect(metadata).toBeFalsy(),
	});
};

/** Re-lists an unbilled pro in overage as a set_plans draft, and finalizes the accrued-usage draft. */
const draftUsageThenFinalize = async ({
	customerId,
}: {
	customerId: string;
}) => {
	const pro = products.pro({
		id: "pro",
		items: [items.consumableMessages({ includedUsage: 100 })],
	});
	const { autumnV1, autumnV2_3, autumnV2_4 } = await initScenario({
		customerId,
		setup: [s.customer({ testClock: false }), s.products({ list: [pro] })],
		actions: [],
	});
	await autumnV2_4.billing.attach({
		customer_id: customerId,
		plan_id: pro.id,
		no_billing_changes: true,
		redirect_mode: "never",
	});
	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 150,
	});
	await timeout(2000);

	await autumnV2_4.billing.setPlans<SetPlansParamsV0Input>({
		customer_id: customerId,
		redirect_mode: "if_required",
		phases: [{ starts_at: "now", plans: [{ plan_id: pro.id }] }],
		invoice_mode: {
			enabled: true,
			issue_method: "draft",
			enable_plan_immediately: true,
		},
	});

	const [usageDraft] = await listInvoices({ autumnV2_3, customerId });
	expect(usageDraft).toMatchObject({ status: "draft", total: OVERAGE_TOTAL });
	await finalizeAndSettle({ autumnV2_3, invoice: usageDraft });

	const [subscriptionDraft] = await listInvoices({ autumnV2_3, customerId });
	expect(subscriptionDraft).toMatchObject({
		status: "draft",
		total: BASE_PRICE,
	});
	return { autumnV2_3, planId: pro.id, subscriptionDraft };
};

/** Finalizes the subscription draft and checks the usage was billed once and the plan is active. */
const finalizeSubscriptionDraftAndExpectBilledOnce = async ({
	autumnV2_3,
	customerId,
	planId,
	subscriptionDraft,
}: Awaited<ReturnType<typeof draftUsageThenFinalize>> & {
	customerId: string;
}) => {
	await finalizeAndSettle({ autumnV2_3, invoice: subscriptionDraft });

	const invoices = await listInvoices({ autumnV2_3, customerId });
	expect(invoices.map(({ total }) => total).sort()).toEqual([
		BASE_PRICE,
		OVERAGE_TOTAL,
	]);
	expect(await messagesLineAmounts({ invoices })).toEqual([OVERAGE_TOTAL]);
	// The unbilled pro that set_plans replaced expires; the re-listed one is active.
	await expectPlanStatus({
		customerId,
		planId,
		status: CusProductStatus.Active,
		statuses: [CusProductStatus.Active, CusProductStatus.Expired],
	});
};

test.concurrent(
	`${chalk.yellowBright("set_plans draft with accrued usage: each draft finalized in turn bills the usage once")}`,
	async () => {
		const customerId = "set-plans-draft-usage-replay";
		const scenario = await draftUsageThenFinalize({ customerId });

		// Line items are stored by a queued job.
		await pollUntilAsserted({
			timeoutMs: WEBHOOK_SETTLE_TIMEOUT_MS,
			fetch: () =>
				listInvoices({ autumnV2_3: scenario.autumnV2_3, customerId }),
			assert: ([subscriptionDraft]) =>
				expect(subscriptionDraft.items?.length).toBeGreaterThan(0),
		});
		await expectPlanStatus({
			customerId,
			planId: scenario.planId,
			status: CusProductStatus.Pending,
			statuses: [CusProductStatus.Active, CusProductStatus.Pending],
		});

		await finalizeSubscriptionDraftAndExpectBilledOnce({
			...scenario,
			customerId,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("set_plans draft with accrued usage: finalizing the subscription draft before the hand-off lands still activates once")}`,
	async () => {
		const customerId = "set-plans-draft-usage-replay-race";
		const scenario = await draftUsageThenFinalize({ customerId });

		// The pending row still points at the deferral it is being handed from.
		const customer = await CusService.get({
			db: ctx.db,
			idOrInternalId: customerId,
			orgId: ctx.org.id,
			env: ctx.env,
		});
		const moved = await ctx.db
			.update(customerProducts)
			.set({ metadata_id: "meta_handoff_not_landed" })
			.where(
				and(
					eq(customerProducts.internal_customer_id, customer!.internal_id),
					eq(customerProducts.status, CusProductStatus.Pending),
				),
			)
			.returning();
		expect(moved).toHaveLength(1);

		await finalizeSubscriptionDraftAndExpectBilledOnce({
			...scenario,
			customerId,
		});
	},
);
