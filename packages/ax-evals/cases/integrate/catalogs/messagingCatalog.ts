/**
 * Messaging-platform archetype catalog (Sendly-like, anonymized from a real
 * customer's billing page) for DISPLAY cases: two product groups held
 * simultaneously (transactional email plans, marketing/contacts plans), an
 * add-on that grants MORE of a feature a base plan already grants (forces
 * per-plan quota to come from the balance BREAKDOWN, not customer-level
 * granted), and a usage-priced automations add-on with graduated tiers.
 */
export const messagingCatalog = `import { feature, plan, item } from "atmn";

export const emails = feature({
	id: "emails",
	name: "Emails",
	type: "metered",
	consumable: true,
});

export const contacts = feature({
	id: "contacts",
	name: "Contacts",
	type: "metered",
	consumable: false,
});

export const automationRuns = feature({
	id: "automation_runs",
	name: "Automation Runs",
	type: "metered",
	consumable: true,
});

export const transactionalFree = plan({
	id: "transactional_free",
	name: "Transactional Free",
	group: "transactional",
	autoEnable: true,
	items: [
		item({ featureId: emails.id, included: 3000, reset: { interval: "month" } }),
	],
});

export const transactionalPro = plan({
	id: "transactional_pro",
	name: "Transactional Pro",
	group: "transactional",
	price: { amount: 20, interval: "month" },
	items: [
		item({ featureId: emails.id, included: 50000, reset: { interval: "month" } }),
	],
});

export const marketingFree = plan({
	id: "marketing_free",
	name: "Marketing Free",
	group: "marketing",
	autoEnable: true,
	items: [item({ featureId: contacts.id, included: 500 })],
});

export const marketingPro = plan({
	id: "marketing_pro",
	name: "Marketing Pro",
	group: "marketing",
	price: { amount: 25, interval: "month" },
	items: [item({ featureId: contacts.id, included: 5000 })],
});

// Grants MORE emails on top of a base plan — customer-level granted merges
// this with the base plan's grant; per-plan rows must read the breakdown.
export const emailAddOn = plan({
	id: "email_addon",
	name: "Extra Emails",
	addOn: true,
	price: { amount: 5, interval: "month" },
	items: [
		item({ featureId: emails.id, included: 10000, reset: { interval: "month" } }),
	],
});

// Usage-priced add-on: 1,000 runs included, overage billed on graduated
// tiers (first 1,000 overage runs at $0.05, then $0.02).
export const automationsAddOn = plan({
	id: "automations",
	name: "Automations",
	addOn: true,
	items: [
		item({
			featureId: automationRuns.id,
			included: 1000,
			reset: { interval: "month" },
			price: {
				// Tier bounds are absolute usage: grant ends at 1,000, first
				// paid tier covers overage runs 1,001-2,000.
				tiers: [
					{ to: 2000, amount: 0.05 },
					{ to: "inf", amount: 0.02 },
				],
				tierBehavior: "graduated",
				billingMethod: "usage_based",
				interval: "month",
			},
		}),
	],
});
`;
