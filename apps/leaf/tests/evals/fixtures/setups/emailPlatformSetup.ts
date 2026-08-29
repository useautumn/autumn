import { createSetup } from "../createSetup.js";

const featureIds = {
	ai_credits: "ai_credits",
	automation_runs: "automation_runs",
	contacts: "contacts",
	domains: "domains",
	emails: "emails",
	partner_channel: "partner_channel",
	priority_support: "priority_support",
	sso: "sso",
} as const;

const planIds = {
	enterprise: "enterprise",
	marketingStarter: "marketing_starter",
	marketingStarter10k: "marketing_starter_10k",
	marketingStarter25k: "marketing_starter_25k",
	marketingStarter50k: "marketing_starter_50k",
	marketingStarter100k: "marketing_starter_100k",
	marketingStarter150k: "marketing_starter_150k",
	sendhubPro: "sendhub_pro",
} as const;

const MARKETING_GROUP = "Marketing";

const marketingSizes = [
	{ amount: 40, contacts: 5_000, key: "marketingStarter" },
	{ amount: 80, contacts: 10_000, key: "marketingStarter10k" },
	{ amount: 180, contacts: 25_000, key: "marketingStarter25k" },
	{ amount: 250, contacts: 50_000, key: "marketingStarter50k" },
	{ amount: 450, contacts: 100_000, key: "marketingStarter100k" },
	{ amount: 650, contacts: 150_000, key: "marketingStarter150k" },
] as const;

/** Anonymized email-platform org: a Marketing plan ladder with sized contact
 * variants (no 700K size exists), a custom-priced Enterprise with zero
 * contacts, and a separate transactional plan — the shape behind the
 * "upgrade their marketing product" incident. */
export const emailPlatformSetup = () =>
	createSetup({
		tag: "email-platform",
		agentRules: ({ agentRules }) => agentRules.base({}),
		features: ({ featureList, features }) => ({
			ai_credits: features.consumable({
				featureId: featureIds.ai_credits,
				name: "AI Credits",
			}),
			automation_runs: features.consumable({
				featureId: featureIds.automation_runs,
				name: "Automation Runs",
			}),
			contacts: features.allocated({
				featureId: featureIds.contacts,
				name: "Contacts",
			}),
			domains: features.allocated({
				featureId: featureIds.domains,
				name: "Domains",
			}),
			emails: features.consumable({
				featureId: featureIds.emails,
				name: "Emails",
			}),
			...featureList.boolean({
				featureIds: [
					featureIds.partner_channel,
					featureIds.priority_support,
					featureIds.sso,
				],
			}),
		}),
		plans: ({ basePrice, features, items, plan }) => {
			const marketingPlan = ({
				amount,
				contacts,
				key,
			}: (typeof marketingSizes)[number]) => ({
				...plan.monthly({
					basePrice: basePrice.monthly({ amount }),
					items: [
						items.included({ feature: features.contacts, included: contacts }),
						items.included({ feature: features.ai_credits, included: 100 }),
					],
					name: `Marketing Starter ${contacts / 1_000}K`,
					planId: planIds[key],
				}),
				group: MARKETING_GROUP,
			});
			return {
				enterprise: plan.monthly({
					basePrice: null,
					items: [
						items.included({ feature: features.contacts, included: 0 }),
						items.included({ feature: features.ai_credits, included: 100 }),
						items.included({
							feature: features.automation_runs,
							included: 10_000,
						}),
						items.included({ feature: features.domains, included: 1_000 }),
						items.boolean({ feature: features.sso }),
					],
					name: "Enterprise",
					planId: planIds.enterprise,
				}),
				...Object.fromEntries(
					marketingSizes.map((size) => [size.key, marketingPlan(size)]),
				),
				sendhubPro: {
					...plan.monthly({
						basePrice: basePrice.monthly({ amount: 20 }),
						items: [
							items.included({ feature: features.emails, included: 50_000 }),
							items.included({ feature: features.ai_credits, included: 100 }),
							items.included({ feature: features.domains, included: 10 }),
						],
						name: "SendHub Pro",
						planId: planIds.sendhubPro,
					}),
					group: "Transactional",
				},
			};
		},
		customers: () => ({}),
	});
