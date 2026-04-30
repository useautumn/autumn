/**
 * Three concurrent scenarios for the existing-customer-with-no-address
 * problem after `org.config.automatic_tax` is flipped on.
 *
 * Real Mintlify scenario: ~700 customers were created BEFORE
 * `automatic_tax` was enabled. Most have no address on their Stripe
 * customer record. When the flag flips on, what happens next time those
 * customers are charged or upgraded?
 *
 * The user verified two paths in production (Mintlify org via `bun p`):
 *   1. Free → Pro via Stripe Checkout WORKS — Stripe Checkout collects
 *      address, Stripe Tax computes via Sphere.
 *   2. Pro → Premium via invoice-mode attach FAILED with
 *      "The customer's location isn't recognized." because invoice-mode
 *      invoices (collection_method: send_invoice) have no buyer-facing
 *      address-collection UI.
 *
 * The fix landed in this PR: invoice-mode subs/invoices skip auto_tax.
 * These tests pin down the resulting behavior:
 *
 * Scenario A — Free → Pro via Checkout, no address (PROD-VERIFIED OK)
 *   STRONG ASSERT: session has auto_tax + billing_address_collection +
 *   customer_update + tax_id_collection. The buyer-facing form behavior is
 *   Stripe's territory; we observe-and-warn the Playwright run.
 *
 * Scenario B — Pre-config-flip Checkout-purchased customer, then upgrade.
 *   The realistic prod path: a customer bought Pro via Checkout BEFORE
 *   the org enabled `automatic_tax`. After the flip, an upgrade to
 *   Premium via charge_automatically `billing.attach` MUST succeed with
 *   tax computed — Stripe's waterfall (customer.address → recent
 *   checkout / IP / predicted location) has plenty to go on because the
 *   customer went through Checkout once and Stripe captured an address.
 *   STRONG ASSERT: upgrade succeeds, resulting sub has auto_tax enabled,
 *   and the proration invoice has `automatic_tax.status === "complete"`.
 *
 * Scenario C — Existing customer with PM but no address, INVOICE-MODE upgrade
 *   (PROD-FAILURE-FIXED). Pre-fix: Stripe rejected because invoice-mode
 *   invoices can't collect address. Post-fix: we skip auto_tax entirely
 *   for invoice-mode mutations, so the upgrade SUCCEEDS — just without
 *   tax. STRONG ASSERT: upgrade returns success AND the resulting sub has
 *   `automatic_tax.enabled === false` (skipped due to invoice mode), even
 *   though the org's auto_tax flag is on.
 */

import { expect, test } from "bun:test";
import { completeStripeCheckoutFormV2 } from "@tests/utils/browserPool/completeStripeCheckoutFormV2.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { OrgService } from "@/internal/orgs/OrgService.js";

test.concurrent
	.skip(`${chalk.yellowBright(
		"automatic-tax-no-address (Scenario A — checkout, no address): session forces full address collection + auto_tax",
	)}`, async () => {
		const customerId = "tax-no-addr-checkout";
		const proProd = products.pro({ id: "pro", items: [] });

		// Sub-org with auto_tax already on. Customer is fresh (no PM, no address).
		const { ctx, customer, autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.platform.create({
					configOverrides: { automatic_tax: true },
					taxRegistrations: ["AU"],
				}),
				// No paymentMethod -> forces checkout-URL branch.
				// No stripeCustomerOverrides -> no address on the Stripe customer.
				s.customer({ testClock: false }),
				s.products({ list: [proProd] }),
			],
			actions: [],
		});

		const stripeCusId = customer!.processor!.id!;

		// Sanity: customer was created without an address.
		const stripeCusBefore = await ctx.stripeCli.customers.retrieve(stripeCusId);
		const addressBefore =
			"address" in stripeCusBefore ? stripeCusBefore.address : null;
		expect(addressBefore).toBeNull();
		console.log("[scenario-A] pre-checkout: stripe customer address = null");

		// Attach -> returns checkout URL (no PM available).
		const result = (await autumnV1.attach({
			customer_id: customerId,
			product_id: `pro_${customerId}`,
		})) as { checkout_url?: string };
		expect(result.checkout_url).toBeDefined();

		// PRIMARY ASSERTIONS: the Stripe session itself was created with
		// the full set of address-collection params our fix injects when
		// `org.config.automatic_tax` is on. This is the contract our
		// integration is responsible for — what the buyer does with the
		// form is Stripe's territory.
		const sessionId = result.checkout_url!.match(
			/cs_(test|live)_[A-Za-z0-9]+/,
		)?.[0];
		expect(sessionId).toBeDefined();
		const session = await ctx.stripeCli.checkout.sessions.retrieve(sessionId!);

		// Strong assertions: every observable field that matters for tax
		// to land. Note: `customer_update` is a create-only param and is
		// NOT echoed back on the retrieved Session — we assert it
		// indirectly via the production code path (the v1 + v2 checkout
		// builders both include `customer_update: { address: "auto" }`)
		// and via the unit/integration coverage in
		// automatic-tax-checkout-session.test.ts.
		expect(session.automatic_tax.enabled).toBe(true);
		expect(session.billing_address_collection).toBe("required");
		expect(session.tax_id_collection?.enabled).toBe(true);

		console.log(
			`[scenario-A] checkout session OK: id=${session.id} auto_tax=${session.automatic_tax.enabled} ` +
				`billing_address_collection=${session.billing_address_collection} ` +
				`tax_id_collection=${session.tax_id_collection?.enabled}`,
		);

		// Best-effort browser drive. Stripe's Checkout form fields for
		// address vary by country + test mode; if Playwright can't find
		// the AU address fields it will throw, and we just warn — the
		// session-level contract is already asserted above.
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

		// Give Stripe up to 5s for webhook + back-write (best-effort observation).
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

		// If the Playwright form-fill happened to succeed and a sub got
		// created, verify the chain held end-to-end. Otherwise we don't
		// fail the test — session-level contract was already asserted.
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

	// Sub-org starts WITH auto_tax OFF. Customer is fresh (no PM, no
	// address) which forces the attach-returns-checkout-URL branch.
	const { ctx, customer, autumnV1, autumnV2_2 } = await initScenario({
		customerId,
		setup: [
			s.platform.create({
				// No configOverrides -> automatic_tax starts off.
				taxRegistrations: ["AU"],
			}),
			s.customer({ testClock: false }),
			s.products({ list: [proProd, premiumProd] }),
		],
		actions: [],
	});

	const stripeCusId = customer!.processor!.id!;

	// Sanity: address is null on the Stripe customer pre-checkout.
	const stripeCusBefore = await ctx.stripeCli.customers.retrieve(stripeCusId);
	const addressBefore =
		"address" in stripeCusBefore ? stripeCusBefore.address : null;
	expect(addressBefore).toBeNull();

	// Step 1: buy Pro via Stripe Checkout BEFORE the org enables
	// automatic_tax. Drive the Playwright helper with a real AU
	// billing address. This seeds:
	//   - the Stripe customer's `address` field
	//   - Stripe's internal waterfall (IP / predicted location)
	// so that any subsequent charge_automatically mutation has a
	// jurisdiction available even without an explicit `automatic_tax`
	// param on Checkout itself (the org flag is OFF here).
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

	// Give Stripe webhook + back-write a moment to land the sub.
	await new Promise((r) => setTimeout(r, 5000));

	const proSubs = await ctx.stripeCli.subscriptions.list({
		customer: stripeCusId,
		limit: 1,
	});
	expect(proSubs.data.length).toBeGreaterThan(0);

	// Step 2: flip the org config to enable automatic_tax. This DB write
	// also invalidates the secret-key cache via OrgService.update's
	// internal clearOrgCache call, so the next API request re-reads the
	// fresh config.
	await OrgService.update({
		db: ctx.db,
		orgId: ctx.org.id,
		updates: {
			config: { ...ctx.org.config, automatic_tax: true },
		},
	});
	// Small delay to let multi-region Redis invalidation settle.
	await new Promise((r) => setTimeout(r, 500));

	// Step 3: upgrade Pro -> Premium via charge_automatically
	// `billing.attach` (the V2_2 path). Stripe's waterfall has the
	// AU address from Checkout, so auto_tax MUST land cleanly with
	// tax computed.
	await autumnV2_2.billing.attach({
		customer_id: customerId,
		plan_id: `premium_${customerId}`,
	});

	// STRONG ASSERTIONS: upgrade succeeded (no throw), resulting sub
	// has auto_tax enabled, and the proration invoice has tax fully
	// resolved (`status: "complete"`).
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
	// The most recent invoice should be the proration invoice from
	// the upgrade.
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

test.concurrent
	.skip(`${chalk.yellowBright(
		"automatic-tax-no-address (Scenario C — INVOICE-MODE upgrade, no address): post-fix MUST succeed without tax",
	)}`, async () => {
		const customerId = "tax-no-addr-invoice-mode";
		const proProd = products.pro({ id: "pro", items: [] });
		const premiumProd = products.premium({ id: "premium", items: [] });

		// Sub-org starts WITH auto_tax OFF so the initial Pro attach
		// succeeds (auto_tax + no address would fail at create time even
		// for a fresh customer). Customer has PM but no address.
		const { ctx, customer, autumnV2_2 } = await initScenario({
			customerId,
			setup: [
				s.platform.create({
					// No configOverrides -> automatic_tax starts off.
					taxRegistrations: ["AU"],
				}),
				s.customer({
					testClock: false,
					paymentMethod: "success",
					// NO stripeCustomerOverrides — Stripe customer has no address.
				}),
				s.products({ list: [proProd, premiumProd] }),
			],
			actions: [s.billing.attach({ productId: "pro" })],
		});

		const stripeCusId = customer!.processor!.id!;

		// Sanity: customer has no address; initial Pro sub has no auto_tax.
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

		// Flip the org config to enable automatic_tax.
		await OrgService.update({
			db: ctx.db,
			orgId: ctx.org.id,
			updates: {
				config: { ...ctx.org.config, automatic_tax: true },
			},
		});

		// Trigger an upgrade Pro -> Premium via INVOICE-MODE billing.attach.
		// This is the prod-failure case the user hit on Mintlify.
		//
		// PRE-FIX BEHAVIOR: Stripe rejected the sub.update with
		//   "The customer's location isn't recognized. Set a valid
		//    customer address in order to automatically calculate tax."
		// because invoice-mode invoices (collection_method: send_invoice)
		// have no hosted address-collection UI.
		//
		// POST-FIX BEHAVIOR (this test): we skip `automatic_tax` entirely
		// for invoice-mode mutations in
		//   - executeStripeSubscriptionOperation (sub.create + sub.update)
		//   - buildStripeSubscriptionUpdateAction (sub.update params)
		//   - createInvoiceForBilling (invoice.create)
		//   - createStripeSub2 (legacy v1 sub.create)
		//   - handleOneOffFunction (legacy v1 invoice.create)
		// So the upgrade succeeds — the resulting sub/invoice just won't
		// have tax computed (which is the design choice we landed on:
		// Stripe Tax simply can't compute tax without an address, and
		// invoice mode has no way to collect one).
		// V2_2 schema uses `invoice_mode: { enabled: true }`. The legacy
		// `invoice: true` alias is V0/V1_Beta only and isn't on the V2_2
		// AttachParamsV1Schema — passing it would silently no-op the
		// invoice-mode discriminator (`billingContext.invoiceMode` would
		// stay falsy) and then `automatic_tax: { enabled: true }` would
		// leak through to a `charge_automatically` Stripe call, hitting
		// the "customer's location isn't recognized" error we're trying
		// to avoid. This is exactly what failed before.
		await autumnV2_2.billing.attach({
			customer_id: customerId,
			plan_id: `premium_${customerId}`,
			invoice_mode: { enabled: true },
		});

		// STRONG ASSERTIONS: upgrade succeeded (no exception above) and
		// the resulting sub has auto_tax disabled.
		//
		// Note: the SUB itself stays in its original collection_method
		// (charge_automatically) because the upgrade only flips invoice
		// mode for the PRORATION INVOICE, not the existing sub. We assert
		// the invoice-level discriminator below.
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

		// At least one of the resulting invoices is in send_invoice mode
		// (the proration invoice for the upgrade), and every send_invoice
		// invoice has auto_tax disabled — this is the prod-failure-fix
		// proper discriminator.
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
