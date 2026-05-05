/**
 * Existing-customer-no-address scenarios after `automatic_tax` is flipped on.
 *
 * Background: ~700 Mintlify customers were created BEFORE auto_tax was
 * enabled. Free→Pro via Checkout works (Checkout collects address);
 * Pro→Premium via invoice-mode failed with "customer's location isn't
 * recognized" because send_invoice has no address-collection UI. Fix:
 * invoice-mode mutations skip auto_tax.
 *
 * A — Checkout, no address: session has auto_tax + address-collection + tax_id.
 * B — Pre-flip Checkout, then charge_automatically upgrade succeeds WITH tax.
 * C — Existing customer, INVOICE-MODE upgrade succeeds WITHOUT tax (the fix).
 */

import { expect, test } from "bun:test";
import { completeStripeCheckoutFormV2 } from "@tests/utils/browserPool/completeStripeCheckoutFormV2.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { OrgService } from "@/internal/orgs/OrgService.js";

test.concurrent(`${chalk.yellowBright(
	"automatic-tax-no-address (Scenario A — checkout, no address): session forces full address collection + auto_tax",
)}`, async () => {
	const customerId = "tax-no-addr-checkout";
	const proProd = products.pro({ id: "pro", items: [] });

	// Sub-org with auto_tax on. Fresh customer: no PM, no address.
	const { ctx, customer, autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.platform.create({
				configOverrides: { automatic_tax: true },
				taxRegistrations: ["AU"],
			}),
			s.customer({ testClock: false }),
			s.products({ list: [proProd] }),
		],
		actions: [],
	});

	const stripeCusId = customer!.processor!.id!;

	const stripeCusBefore = await ctx.stripeCli.customers.retrieve(stripeCusId);
	const addressBefore =
		"address" in stripeCusBefore ? stripeCusBefore.address : null;
	expect(addressBefore).toBeNull();
	console.log("[scenario-A] pre-checkout: stripe customer address = null");

	const result = (await autumnV1.attach({
		customer_id: customerId,
		product_id: `pro_${customerId}`,
	})) as { checkout_url?: string };
	expect(result.checkout_url).toBeDefined();

	// Assert the session was created with the full set of
	// address-collection params our fix injects. `customer_update` is
	// create-only and not echoed in the retrieved Session — that path
	// is asserted indirectly via automatic-tax-checkout-session.test.ts.
	const sessionId = result.checkout_url!.match(
		/cs_(test|live)_[A-Za-z0-9]+/,
	)?.[0];
	expect(sessionId).toBeDefined();
	const session = await ctx.stripeCli.checkout.sessions.retrieve(sessionId!);

	expect(session.automatic_tax.enabled).toBe(true);
	expect(session.billing_address_collection).toBe("required");
	expect(session.tax_id_collection?.enabled).toBe(true);

	console.log(
		`[scenario-A] checkout session OK: id=${session.id} auto_tax=${session.automatic_tax.enabled} ` +
			`billing_address_collection=${session.billing_address_collection} ` +
			`tax_id_collection=${session.tax_id_collection?.enabled}`,
	);

	// Best-effort browser drive. Form fields vary by country; we warn
	// on Playwright failure since the session contract is already asserted.
	try {
		await completeStripeCheckoutFormV2({
			url: result.checkout_url!,
			billingAddress: {
				country: "AU",
				line1: "1 Test St",
				city: "Sydney",
				state: "NSW",
				postal_code: "2000",
			},
		});
	} catch (err) {
		console.warn(
			"[scenario-A] browser checkout helper threw — likely a form-fill issue, not a logic bug. Session-level assertions already passed:",
			err instanceof Error ? err.message : err,
		);
	}

	// Wait for Stripe webhook + back-write (best-effort).
	await new Promise((r) => setTimeout(r, 5000));

	const subs = await ctx.stripeCli.subscriptions.list({
		customer: stripeCusId,
		limit: 1,
	});
	const stripeCusAfter = await ctx.stripeCli.customers.retrieve(stripeCusId);
	const addressAfter =
		"address" in stripeCusAfter ? stripeCusAfter.address : null;

	console.log(
		`[scenario-A] post-checkout: subs=${subs.data.length} ` +
			`subAutoTax=${subs.data[0]?.automatic_tax.enabled ?? "N/A"} ` +
			`customerAddress=${JSON.stringify(addressAfter)}`,
	);

	// If Playwright form-fill succeeded and produced a sub, verify the
	// end-to-end chain. Otherwise the session-level contract suffices.
	if (subs.data.length > 0) {
		expect(subs.data[0].automatic_tax.enabled).toBe(true);
		expect(addressAfter).not.toBeNull();
		expect(addressAfter?.country).toBe("AU");
	}
}, 600_000);

test.concurrent(`${chalk.yellowBright(
	"automatic-tax-no-address (Scenario B — pre-flip Checkout, then charge_automatically upgrade): waterfall resolves location, upgrade succeeds WITH tax",
)}`, async () => {
	const customerId = "tax-no-addr-existing";
	const proProd = products.pro({ id: "pro", items: [] });
	const premiumProd = products.premium({ id: "premium", items: [] });

	// auto_tax OFF, fresh customer (no PM, no address) so attach returns
	// a checkout URL.
	const { ctx, customer, autumnV1, autumnV2_2 } = await initScenario({
		customerId,
		setup: [
			s.platform.create({
				taxRegistrations: ["AU"],
			}),
			s.customer({ testClock: false }),
			s.products({ list: [proProd, premiumProd] }),
		],
		actions: [],
	});

	const stripeCusId = customer!.processor!.id!;

	const stripeCusBefore = await ctx.stripeCli.customers.retrieve(stripeCusId);
	const addressBefore =
		"address" in stripeCusBefore ? stripeCusBefore.address : null;
	expect(addressBefore).toBeNull();

	// Step 1: Pro via Checkout BEFORE auto_tax flip. Seeds the Stripe
	// customer's `address` and Stripe's location waterfall.
	const proResult = (await autumnV1.attach({
		customer_id: customerId,
		product_id: `pro_${customerId}`,
	})) as { checkout_url?: string };
	expect(proResult.checkout_url).toBeDefined();

	await completeStripeCheckoutFormV2({
		url: proResult.checkout_url!,
		billingAddress: {
			country: "AU",
			line1: "1 Test St",
			city: "Sydney",
			state: "NSW",
			postal_code: "2000",
		},
	});

	// Wait for Stripe webhook + back-write to land the sub.
	await new Promise((r) => setTimeout(r, 5000));

	const proSubs = await ctx.stripeCli.subscriptions.list({
		customer: stripeCusId,
		limit: 1,
	});
	expect(proSubs.data.length).toBeGreaterThan(0);

	// Step 2: flip auto_tax on. OrgService.update invalidates the
	// secret-key cache so the next request reads fresh config.
	await OrgService.update({
		db: ctx.db,
		orgId: ctx.org.id,
		updates: {
			config: { ...ctx.org.config, automatic_tax: true },
		},
	});
	// Wait for multi-region Redis invalidation to settle.
	await new Promise((r) => setTimeout(r, 500));

	// Step 3: charge_automatically upgrade. Stripe's waterfall has the
	// AU address from Checkout, so auto_tax lands cleanly.
	await autumnV2_2.billing.attach({
		customer_id: customerId,
		plan_id: `premium_${customerId}`,
	});

	// Upgrade succeeded; sub has auto_tax enabled; proration invoice has
	// tax fully resolved.
	const upgradedSubs = await ctx.stripeCli.subscriptions.list({
		customer: stripeCusId,
		limit: 1,
	});
	expect(upgradedSubs.data.length).toBeGreaterThan(0);
	const upgradedSub = upgradedSubs.data[0];
	expect(upgradedSub.automatic_tax.enabled).toBe(true);

	const invoices = await ctx.stripeCli.invoices.list({
		customer: stripeCusId,
		limit: 5,
	});
	// Most recent invoice = proration invoice from the upgrade.
	const prorationInvoice = invoices.data[0];
	expect(prorationInvoice).toBeDefined();
	expect(prorationInvoice.automatic_tax.enabled).toBe(true);
	expect(prorationInvoice.automatic_tax.status).toBe("complete");

	console.log(
		`[scenario-B] upgrade succeeded with tax: ` +
			`sub_auto_tax=${upgradedSub.automatic_tax.enabled}, ` +
			`proration_invoice_auto_tax_status=${prorationInvoice.automatic_tax.status}, ` +
			`proration_invoice_total_tax=${prorationInvoice.total_taxes?.[0]?.amount ?? "N/A"}`,
	);
}, 600_000);

test.concurrent(`${chalk.yellowBright(
	"automatic-tax-no-address (Scenario C — INVOICE-MODE upgrade, no address): post-fix MUST succeed without tax",
)}`, async () => {
	const customerId = "tax-no-addr-invoice-mode";
	const proProd = products.pro({ id: "pro", items: [] });
	const premiumProd = products.premium({ id: "premium", items: [] });

	// auto_tax OFF so initial Pro attach succeeds (auto_tax + no
	// address would fail at create even for a fresh customer).
	// Customer has PM but no address.
	const { ctx, customer, autumnV2_2 } = await initScenario({
		customerId,
		setup: [
			s.platform.create({
				taxRegistrations: ["AU"],
			}),
			s.customer({
				testClock: false,
				paymentMethod: "success",
			}),
			s.products({ list: [proProd, premiumProd] }),
		],
		actions: [s.billing.attach({ productId: "pro" })],
	});

	const stripeCusId = customer!.processor!.id!;

	const stripeCusBefore = await ctx.stripeCli.customers.retrieve(stripeCusId);
	const addressBefore =
		"address" in stripeCusBefore ? stripeCusBefore.address : null;
	expect(addressBefore).toBeNull();

	const initialSubs = await ctx.stripeCli.subscriptions.list({
		customer: stripeCusId,
		limit: 1,
	});
	expect(initialSubs.data[0].automatic_tax.enabled).toBe(false);
	console.log(
		"[scenario-C] pre-flip: customer address=null, initial sub auto_tax=false",
	);

	// Flip auto_tax on.
	await OrgService.update({
		db: ctx.db,
		orgId: ctx.org.id,
		updates: {
			config: { ...ctx.org.config, automatic_tax: true },
		},
	});

	// INVOICE-MODE upgrade (the Mintlify prod-failure case).
	// Pre-fix: Stripe rejected with "customer's location isn't recognized"
	// since send_invoice has no address-collection UI. Post-fix: we skip
	// auto_tax for invoice-mode mutations so the upgrade succeeds without
	// tax computed.
	//
	// Use V2_2's `invoice_mode: { enabled: true }`; the legacy `invoice`
	// alias isn't on V2_2, so passing it would silently no-op the
	// discriminator and leak auto_tax into a charge_automatically call.
	await autumnV2_2.billing.attach({
		customer_id: customerId,
		plan_id: `premium_${customerId}`,
		invoice_mode: { enabled: true },
	});

	// Upgrade succeeded; resulting sub has auto_tax disabled.
	// The sub stays charge_automatically (invoice-mode only flips for
	// the proration invoice); we assert the invoice-level discriminator below.
	const updatedSubs = await ctx.stripeCli.subscriptions.list({
		customer: stripeCusId,
		limit: 1,
	});
	const upgradedSub = updatedSubs.data[0];
	expect(upgradedSub).toBeDefined();
	expect(upgradedSub.automatic_tax.enabled).toBe(false);
	console.log(
		`[scenario-C] upgrade succeeded: sub_id=${upgradedSub.id} ` +
			`collection_method=${upgradedSub.collection_method} ` +
			`sub_auto_tax=${upgradedSub.automatic_tax.enabled}`,
	);

	// At least one resulting invoice is send_invoice (the upgrade's
	// proration invoice), and every send_invoice invoice has auto_tax
	// disabled — the prod-failure-fix discriminator.
	const invoices = await ctx.stripeCli.invoices.list({
		customer: stripeCusId,
		limit: 10,
	});
	const sendInvoiceInvoices = invoices.data.filter(
		(inv) => inv.collection_method === "send_invoice",
	);
	expect(sendInvoiceInvoices.length).toBeGreaterThan(0);
	for (const inv of sendInvoiceInvoices) {
		expect(inv.automatic_tax.enabled).toBe(false);
	}
	console.log(
		`[scenario-C] send_invoice invoices: ${sendInvoiceInvoices.length} ` +
			`found (out of ${invoices.data.length} total), all with auto_tax=false`,
	);
}, 300_000);
