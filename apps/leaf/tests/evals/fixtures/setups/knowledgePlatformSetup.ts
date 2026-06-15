import { createSetup } from "../createSetup.js";

const featureIds = {
	activity_events: "activity_events",
	approval_chains: "approval_chains",
	automation_rules: "automation_rules",
	brand_controls: "brand_controls",
	compliance_controls: "compliance_controls",
	credits: "credits",
	export_center: "export_center",
	hosted_solution: "hosted_solution",
	insight_reports: "insight_reports",
	member_slots: "member_slots",
	outbound_hooks: "outbound_hooks",
	platform_api: "platform_api",
	priority_queue: "priority_queue",
	private_spaces: "private_spaces",
	project_slots: "project_slots",
	revision_history: "revision_history",
	team_policies: "team_policies",
	unlimited_seats: "unlimited_seats",
	workspaces: "workspaces",
} as const;

const planIds = {
	automationPack: "automation_pack",
	enterprise: "enterprise",
	launch: "launch",
	scale: "scale",
	scaleYearly: "scale_yearly",
	securityPack: "security_pack",
	trial: "trial",
	whiteLabelPack: "white_label_pack",
} as const;

const platformFeatureIds = [
	featureIds.insight_reports,
	featureIds.team_policies,
	featureIds.private_spaces,
	featureIds.export_center,
	featureIds.priority_queue,
	featureIds.automation_rules,
	featureIds.outbound_hooks,
	featureIds.platform_api,
	featureIds.approval_chains,
	featureIds.brand_controls,
	featureIds.compliance_controls,
	featureIds.revision_history,
] as const;

const contractFeatureIds = [
	featureIds.hosted_solution,
	featureIds.unlimited_seats,
] as const;

/** Anonymized org setup with credits, many feature flags, core plans, and add-ons. */
export const knowledgePlatformSetup = () =>
	createSetup({
		tag: "knowledge-platform",
		agentRules: ({ agentRules }) =>
			agentRules.base({
				entityRules: agentRules.entityRules({
					attachToEntities: true,
					entityFeatureId: featureIds.workspaces,
				}),
			}),
		features: ({ featureList, features }) => ({
			activity_events: features.consumable({
				featureId: featureIds.activity_events,
				name: "Activity Events",
			}),
			credits: features.creditSystem({
				featureId: featureIds.credits,
				meteredFeatureId: featureIds.activity_events,
			}),
			member_slots: features.allocated({ featureId: featureIds.member_slots }),
			project_slots: features.allocated({
				featureId: featureIds.project_slots,
			}),
			workspaces: features.allocated({
				featureId: featureIds.workspaces,
				name: "Workspaces",
			}),
			...featureList.boolean({ featureIds: platformFeatureIds }),
			...featureList.boolean({
				featureIds: contractFeatureIds,
				names: {
					hosted_solution: "Hosted Solution",
					unlimited_seats: "Unlimited Seats",
				},
			}),
		}),
		plans: ({ basePrice, features, itemList, items, plan, planList }) => {
			// Mirror server/tests/scenarios/agent/knowledge-platform.ts credit economics.
			const creditItems = [
				items.prepaidCredits({
					feature: features.credits,
					included: 1_000,
					tiers: [
						{ to: 2_000, amount: 0, flat_amount: 200 },
						{ to: 3_500, amount: 0, flat_amount: 300 },
						{ to: 5_000, amount: 0, flat_amount: 400 },
						{ to: 7_000, amount: 0, flat_amount: 500 },
						{ to: "inf", amount: 0, flat_amount: 600 },
					],
				}),
				items.consumableCredits({ feature: features.credits, amount: 0.1 }),
			];
			const coreFeatures = [
				featureIds.insight_reports,
				featureIds.team_policies,
				featureIds.private_spaces,
				featureIds.export_center,
				featureIds.automation_rules,
				featureIds.platform_api,
			];
			const expandedFeatures = [
				...coreFeatures,
				featureIds.priority_queue,
				featureIds.outbound_hooks,
				featureIds.approval_chains,
				featureIds.brand_controls,
				featureIds.compliance_controls,
				featureIds.revision_history,
			];

			return {
				launch: plan.monthly({
					basePrice: basePrice.monthly({ amount: 300 }),
					items: [
						...creditItems,
						...itemList.boolean({ featureIds: coreFeatures, features }),
					],
					planId: planIds.launch,
				}),
				scale: plan.monthly({
					basePrice: basePrice.monthly({ amount: 500 }),
					items: [
						...creditItems,
						...itemList.boolean({ featureIds: expandedFeatures, features }),
					],
					planId: planIds.scale,
				}),
				scaleYearly: plan.annual({
					basePrice: basePrice.annual({ amount: 5_000 }),
					items: [
						...creditItems,
						...itemList.boolean({ featureIds: expandedFeatures, features }),
					],
					planId: planIds.scaleYearly,
				}),
				trial: plan.monthly({
					basePrice: null,
					items: [
						items.included({ feature: features.credits, included: 1_000 }),
						...itemList.boolean({
							featureIds: [
								featureIds.insight_reports,
								featureIds.private_spaces,
								featureIds.platform_api,
							],
							features,
						}),
					],
					planId: planIds.trial,
				}),
				enterprise: plan.monthly({
					basePrice: null,
					items: [
						...creditItems,
						items.included({ feature: features.member_slots, included: 25 }),
						items.included({ feature: features.project_slots, included: 100 }),
						...itemList.boolean({ featureIds: expandedFeatures, features }),
					],
					planId: planIds.enterprise,
				}),
				...planList.addOns({
					addOns: [
						{
							amount: 75,
							feature: features.automation_rules,
							key: "automationPack",
							planId: planIds.automationPack,
						},
						{
							amount: 2_400,
							feature: features.compliance_controls,
							interval: "year",
							key: "securityPack",
							planId: planIds.securityPack,
						},
						{
							amount: 3_000,
							feature: features.brand_controls,
							interval: "year",
							key: "whiteLabelPack",
							planId: planIds.whiteLabelPack,
						},
					],
				}),
			};
		},
		customers: () => ({}),
	});
