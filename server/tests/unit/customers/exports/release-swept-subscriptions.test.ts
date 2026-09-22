/**
 * The sweep holds every Stripe subscription for the whole run, which is the
 * export's peak memory. The walk is a forward keyset scan, so a verified page's
 * subscriptions are unreachable — except under a Stripe id shared by a customer
 * on a later page.
 */

import { describe, expect, it } from "bun:test";
import type Stripe from "stripe";
import type { CustomerExportScalarRow } from "@/internal/customers/exports/queries/getCustomerExportScalars.js";
import { releaseSweptSubscriptions } from "@/internal/customers/exports/verify/releaseSweptSubscriptions.js";
import type { BillingVerifySweep } from "@/internal/customers/exports/verify/setupBillingVerifySweep.js";

const scalarFor = (stripeCustomerId: string | null) =>
	({
		internal_id: `internal_${stripeCustomerId ?? "none"}`,
		id: `cus_${stripeCustomerId ?? "none"}`,
		processor: stripeCustomerId ? { id: stripeCustomerId } : null,
	}) as unknown as CustomerExportScalarRow;

const sweepWith = (stripeCustomerIds: string[]): BillingVerifySweep => ({
	stripeReader: {} as Stripe,
	sweptSubscriptions: new Map(
		stripeCustomerIds.map((id) => [
			id,
			[{ id: `sub_${id}` } as Stripe.Subscription],
		]),
	),
});

describe("releaseSweptSubscriptions", () => {
	it("drops a verified page's subscriptions so peak memory tracks the page", () => {
		const sweep = sweepWith(["cus_a", "cus_b", "cus_c"]);

		releaseSweptSubscriptions({
			sweep,
			scalars: [scalarFor("cus_a"), scalarFor("cus_b")],
			sharedStripeCustomerIds: new Set(),
		});

		expect([...sweep.sweptSubscriptions.keys()]).toEqual(["cus_c"]);
	});

	it("keeps a shared Stripe id a later page still has to find", () => {
		const sweep = sweepWith(["cus_shared", "cus_solo"]);

		releaseSweptSubscriptions({
			sweep,
			scalars: [scalarFor("cus_shared"), scalarFor("cus_solo")],
			sharedStripeCustomerIds: new Set(["cus_shared"]),
		});

		expect([...sweep.sweptSubscriptions.keys()]).toEqual(["cus_shared"]);
	});

	it("ignores a customer with no Stripe id", () => {
		const sweep = sweepWith(["cus_a"]);

		releaseSweptSubscriptions({
			sweep,
			scalars: [scalarFor(null)],
			sharedStripeCustomerIds: new Set(),
		});

		expect(sweep.sweptSubscriptions.size).toBe(1);
	});
});
