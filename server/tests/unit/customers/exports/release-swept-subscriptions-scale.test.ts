/**
 * Measures retained heap at Mobbin's dimensions (~150k Stripe subscriptions
 * walked in 2,000-customer pages) to confirm releasing each verified page keeps
 * peak memory off the org size.
 *
 * Skipped unless MEASURE_EXPORT_MEMORY=1, since it allocates ~300MB. Reads
 * bun:jsc heapStats rather than process.memoryUsage(), whose heapUsed does not
 * fall when JSC frees an object graph.
 */

import { heapStats } from "bun:jsc";
import { describe, expect, it } from "bun:test";
import type Stripe from "stripe";
import type { CustomerExportScalarRow } from "@/internal/customers/exports/queries/getCustomerExportScalars.js";
import { releaseSweptSubscriptions } from "@/internal/customers/exports/verify/releaseSweptSubscriptions.js";
import type { BillingVerifySweep } from "@/internal/customers/exports/verify/setupBillingVerifySweep.js";

const SUBSCRIPTION_COUNT = 150_000;
const PAGE_SIZE = 2_000;
const MACHINE_HEAP_BUDGET_MB = 2048;

/** Close to a real Stripe subscription's ~3KB of JSON, so the measurement
 * reflects what the sweep actually holds. */
const subscriptionFor = (index: number) =>
	({
		id: `sub_${index}`,
		object: "subscription",
		customer: `cus_${index}`,
		status: "active",
		currency: "usd",
		created: 1_750_000_000,
		billing_cycle_anchor: 1_750_000_000,
		collection_method: "charge_automatically",
		default_payment_method: `pm_${index}`,
		latest_invoice: `in_${index}`,
		livemode: true,
		discounts: [],
		default_tax_rates: [],
		automatic_tax: { enabled: false, liability: null },
		cancellation_details: { comment: null, feedback: null, reason: null },
		payment_settings: {
			payment_method_options: null,
			payment_method_types: null,
			save_default_payment_method: "off",
		},
		trial_settings: {
			end_behavior: { missing_payment_method: "create_invoice" },
		},
		metadata: { org_id: `org_${index % 100}`, seat_count: String(index % 40) },
		items: {
			object: "list",
			total_count: 2,
			has_more: false,
			url: `/v1/subscription_items?subscription=sub_${index}`,
			data: [0, 1].map((slot) => ({
				id: `si_${index}_${slot}`,
				object: "subscription_item",
				created: 1_750_000_000,
				quantity: 1,
				subscription: `sub_${index}`,
				tax_rates: [],
				discounts: [],
				metadata: { plan: "pro", seat: "yes" },
				price: {
					id: `price_${index % 50}_${slot}`,
					object: "price",
					active: true,
					billing_scheme: "per_unit",
					created: 1_750_000_000,
					currency: "usd",
					livemode: true,
					metadata: { tier: "standard" },
					product: `prod_${index % 20}`,
					recurring: {
						interval: "month",
						interval_count: 1,
						usage_type: "licensed",
					},
					type: "recurring",
					unit_amount: 2000,
					unit_amount_decimal: "2000",
				},
			})),
		},
	}) as unknown as Stripe.Subscription;

const scalarFor = (index: number) =>
	({
		internal_id: `internal_${index}`,
		id: `customer_${index}`,
		processor: { id: `cus_${index}` },
	}) as unknown as CustomerExportScalarRow;

const settledHeapMb = () => {
	Bun.gc(true);
	Bun.gc(true);
	return heapStats().heapSize / 1024 / 1024;
};

const buildSweep = (): BillingVerifySweep => ({
	stripeReader: {} as Stripe,
	sweptSubscriptions: new Map(
		Array.from({ length: SUBSCRIPTION_COUNT }, (_, index) => [
			`cus_${index}`,
			[subscriptionFor(index)],
		]),
	),
});

const walkReleasingEachPage = ({ sweep }: { sweep: BillingVerifySweep }) => {
	for (let start = 0; start < SUBSCRIPTION_COUNT; start += PAGE_SIZE) {
		const scalars = Array.from({ length: PAGE_SIZE }, (_, offset) =>
			scalarFor(start + offset),
		);
		releaseSweptSubscriptions({
			sweep,
			scalars,
			sharedStripeCustomerIds: new Set(),
		});
	}
};

describe.skipIf(process.env.MEASURE_EXPORT_MEMORY !== "1")(
	"swept subscription retention at Mobbin scale",
	() => {
		it("releases the whole sweep as the walk advances", () => {
			const emptyMb = settledHeapMb();

			const sweep = buildSweep();
			const sweptMb = settledHeapMb();
			const heldMb = sweptMb - emptyMb;

			walkReleasingEachPage({ sweep });
			const drainedMb = settledHeapMb();
			const retainedMb = drainedMb - emptyMb;

			console.log(
				`${SUBSCRIPTION_COUNT} subscriptions: held ${heldMb.toFixed(0)}MB · retained after walk ${retainedMb.toFixed(0)}MB · machine budget ${MACHINE_HEAP_BUDGET_MB}MB`,
			);

			expect(sweep.sweptSubscriptions.size).toBe(0);
			expect(heldMb).toBeGreaterThan(100);
			expect(retainedMb).toBeLessThan(heldMb * 0.1);
		});
	},
);
