/**
 * Messaging-platform archetype catalog (Sendly-like, anonymized from a real
 * customer's billing page) for DISPLAY cases: two product groups held
 * simultaneously (transactional email plans, marketing/contacts plans), an
 * add-on that grants MORE of a feature a base plan already grants (forces
 * per-plan quota to come from the balance BREAKDOWN, not customer-level
 * granted), and a usage-priced automations add-on with graduated tiers.
 */
export const messagingCatalog = `import { atmn, feature, plan } from "atmn";

export default atmn({
	features: [
		feature({
			featureId: "emails",
			name: "Emails",
			type: "metered",
			consumable: true,
		}),
		feature({
			featureId: "contacts",
			name: "Contacts",
			type: "metered",
			consumable: false,
		}),
		feature({
			featureId: "automation_runs",
			name: "Automation Runs",
			type: "metered",
			consumable: true,
		}),
	],
	plans: [
		plan({
			planId: "transactional_free",
			name: "Transactional Free",
			group: "transactional",
			autoEnable: true,
			items: [
				{
					featureId: "emails",
					included: 3000,
					reset: { interval: "month" },
				},
			],
		}),
		plan({
			planId: "transactional_pro",
			name: "Transactional Pro",
			group: "transactional",
			price: { amount: 20, interval: "month" },
			items: [
				{
					featureId: "emails",
					included: 50000,
					reset: { interval: "month" },
				},
			],
		}),
		plan({
			planId: "marketing_free",
			name: "Marketing Free",
			group: "marketing",
			autoEnable: true,
			items: [{ featureId: "contacts", included: 500 }],
		}),
		plan({
			planId: "marketing_pro",
			name: "Marketing Pro",
			group: "marketing",
			price: { amount: 25, interval: "month" },
			items: [{ featureId: "contacts", included: 5000 }],
		}),
		plan({
			planId: "email_addon",
			name: "Extra Emails",
			addOn: true,
			price: { amount: 5, interval: "month" },
			items: [
				{
					featureId: "emails",
					included: 10000,
					reset: { interval: "month" },
				},
			],
		}),
		plan({
			planId: "automations",
			name: "Automations",
			addOn: true,
			items: [
				{
					featureId: "automation_runs",
					included: 1000,
					reset: { interval: "month" },
					price: {
						tiers: [
							{ to: 2000, amount: 0.05 },
							{ to: "inf", amount: 0.02 },
						],
						tierBehavior: "graduated",
						billingMethod: "usage_based",
						interval: "month",
					},
				},
			],
		}),
	],
});
`;
