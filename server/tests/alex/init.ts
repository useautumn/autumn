import dotenv from "dotenv";

dotenv.config();

import {
	AggregateType,
	AllowanceType,
	AppEnv,
	BillingInterval,
	EntInterval,
	FeatureType,
} from "@autumn/shared";
import { initDrizzle } from "@/db/initDrizzle.js";
import { FeatureService } from "@/internal/features/FeatureService.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import {
	initEntitlement,
	initFeature,
	initFreeTrial,
	initPrice,
	initProduct,
} from "../utils/init.js";

export const alexFeatures = {
	chatMessage: initFeature({
		id: "chatMessage",
		type: FeatureType.Metered,
		aggregateType: AggregateType.Count,
		eventName: "chat_message",
	}),
	deepseekMessage: initFeature({
		id: "deepseekMessage",
		type: FeatureType.Metered,
		aggregateType: AggregateType.Count,
		eventName: "deepseek_message",
	}),
	o1Message: initFeature({
		id: "o1Message",
		type: FeatureType.Metered,
		aggregateType: AggregateType.Count,
		eventName: "o1_message",
	}),
	applyCode: initFeature({
		id: "applyCode",
		type: FeatureType.Metered,
		aggregateType: AggregateType.Count,
		eventName: "apply",
	}),
	gitCommit: initFeature({
		id: "gitCommit",
		type: FeatureType.Metered,
		aggregateType: AggregateType.Count,
		eventName: "git_commit",
	}),
	tabToComplete: initFeature({
		id: "tabToComplete",
		type: FeatureType.Metered,
		aggregateType: AggregateType.Count,
		eventName: "suggestion",
	}),
	topUpMessage: initFeature({
		id: "topUpMessage",
		type: FeatureType.Metered,
		aggregateType: AggregateType.Count,
		eventName: "top_up_message",
	}),
	voiceInput: initFeature({
		id: "voiceInput",
		type: FeatureType.Metered,
		aggregateType: AggregateType.Count,
		eventName: "voice_input",
	}),
	figmaIntegration: initFeature({
		id: "figmaIntegration",
		type: FeatureType.Boolean,
		eventName: "figma_integration",
	}),
	githubIssuesIntegration: initFeature({
		id: "githubIssuesIntegration",
		type: FeatureType.Boolean,
		eventName: "github_issues_integration",
	}),
	linearIntegration: initFeature({
		id: "linearIntegration",
		type: FeatureType.Boolean,
		eventName: "linear_integration",
	}),
	canAddSeats: initFeature({
		id: "canAddSeats",
		type: FeatureType.Boolean,
		eventName: "can_add_seats",
	}),
	seats: initFeature({
		id: "seats",
		type: FeatureType.Metered,
		aggregateType: AggregateType.Count,
		eventName: "seats",
	}),
};

export const alexProducts = {
	free: initProduct({
		id: "free",
		isDefault: true,
		entitlements: {
			chatMessage: initEntitlement({
				feature: alexFeatures.chatMessage,
				allowance: 50,
				interval: EntInterval.Month,
			}),
			applyCode: initEntitlement({
				feature: alexFeatures.applyCode,
				allowance: 5,
				interval: EntInterval.Month,
			}),
			tabToComplete: initEntitlement({
				feature: alexFeatures.tabToComplete,
				allowance: 50,
				interval: EntInterval.Month,
			}),
			voiceInput: initEntitlement({
				feature: alexFeatures.voiceInput,
				allowance: 5,
				interval: EntInterval.Month,
			}),
			gitCommit: initEntitlement({
				feature: alexFeatures.gitCommit,
				allowance: 5,
				interval: EntInterval.Month,
			}),
			topUpMessage: initEntitlement({
				feature: alexFeatures.topUpMessage,
				allowance: 0,
				interval: EntInterval.Lifetime,
			}),
			o1Message: initEntitlement({
				feature: alexFeatures.o1Message,
				allowance: 5,
				interval: EntInterval.Lifetime,
			}),
			deepseekMessage: initEntitlement({
				feature: alexFeatures.deepseekMessage,
				allowance: 50,
				interval: EntInterval.Month,
			}),
		},
		prices: [],
		freeTrial: null,
	}),

	pro: initProduct({
		id: "pro",
		isDefault: false,
		entitlements: {
			chatMessage: initEntitlement({
				feature: alexFeatures.chatMessage,
				allowance: 500,
				interval: EntInterval.Month,
			}),
			deepseekMessage: initEntitlement({
				feature: alexFeatures.deepseekMessage,
				allowanceType: AllowanceType.Unlimited,
			}),
			applyCode: initEntitlement({
				feature: alexFeatures.applyCode,
				allowanceType: AllowanceType.Unlimited,
			}),
			gitCommit: initEntitlement({
				feature: alexFeatures.gitCommit,
				allowanceType: AllowanceType.Unlimited,
			}),
			voiceInput: initEntitlement({
				feature: alexFeatures.voiceInput,
				allowanceType: AllowanceType.Unlimited,
			}),
			tabToComplete: initEntitlement({
				feature: alexFeatures.tabToComplete,
				allowanceType: AllowanceType.Unlimited,
			}),
			o1Message: initEntitlement({
				feature: alexFeatures.o1Message,
				allowance: 5,
				interval: EntInterval.Lifetime,
			}),
			topUpMessage: initEntitlement({
				feature: alexFeatures.topUpMessage,
				allowance: 0,
				interval: EntInterval.Lifetime,
			}),
		},
		prices: [
			initPrice({
				amount: 20.0, // $20.00
				billingInterval: BillingInterval.Month,
				type: "monthly",
			}),
		],
		freeTrial: initFreeTrial({
			length: 7,
			uniqueFingerprint: true,
		}),
	}),

	topUpMessages: initProduct({
		id: "topUpMessages",
		isDefault: false,
		isAddOn: true,
		entitlements: {
			topUpMessage: initEntitlement({
				feature: alexFeatures.topUpMessage,
				allowance: 0,
				interval: EntInterval.Lifetime,
			}),
		},
		prices: [
			initPrice({
				type: "in_advance",
				amount: 9,
				billingUnits: 250,
				billingInterval: BillingInterval.OneOff,
				feature: alexFeatures.topUpMessage,
			}),
		],
		freeTrial: null,
	}),

	o1TopUps: initProduct({
		id: "o1TopUps",
		isDefault: false,
		isAddOn: true,
		entitlements: {
			o1Message: initEntitlement({
				feature: alexFeatures.o1Message,
				allowance: 0,
				interval: EntInterval.Lifetime,
			}),
		},
		prices: [
			initPrice({
				type: "in_advance",
				amount: 9,
				billingUnits: 25,
				billingInterval: BillingInterval.OneOff,
				feature: alexFeatures.o1Message,
			}),
		],
		freeTrial: null,
	}),

	premium: initProduct({
		id: "premium",
		isDefault: false,
		entitlements: {
			chatMessage: initEntitlement({
				feature: alexFeatures.chatMessage,
				allowance: 1000,
				interval: EntInterval.Month,
			}),
			deepseekMessage: initEntitlement({
				feature: alexFeatures.deepseekMessage,
				allowanceType: AllowanceType.Unlimited,
			}),
			o1Message: initEntitlement({
				feature: alexFeatures.o1Message,
				allowance: 5,
				interval: EntInterval.Month,
			}),
			applyCode: initEntitlement({
				feature: alexFeatures.applyCode,
				allowanceType: AllowanceType.Unlimited,
			}),
			gitCommit: initEntitlement({
				feature: alexFeatures.gitCommit,
				allowanceType: AllowanceType.Unlimited,
			}),
			voiceInput: initEntitlement({
				feature: alexFeatures.voiceInput,
				allowanceType: AllowanceType.Unlimited,
			}),
			tabToComplete: initEntitlement({
				feature: alexFeatures.tabToComplete,
				allowanceType: AllowanceType.Unlimited,
			}),
			topUpMessage: initEntitlement({
				feature: alexFeatures.topUpMessage,
				allowance: 0,
				interval: EntInterval.Lifetime,
			}),
			figmaIntegration: initEntitlement({
				feature: alexFeatures.figmaIntegration,
				allowanceType: AllowanceType.Unlimited,
			}),
			githubIssuesIntegration: initEntitlement({
				feature: alexFeatures.githubIssuesIntegration,
				allowanceType: AllowanceType.Unlimited,
			}),
			linearIntegration: initEntitlement({
				feature: alexFeatures.linearIntegration,
				allowanceType: AllowanceType.Unlimited,
			}),
		},
		prices: [
			initPrice({
				type: "monthly",
				amount: 50,
			}),
		],
		freeTrial: initFreeTrial({
			length: 7,
			uniqueFingerprint: true,
		}),
	}),

	proTeam: initProduct({
		id: "proTeam",
		isDefault: false,
		isAddOn: true,
		entitlements: {
			topUpMessage: initEntitlement({
				feature: alexFeatures.topUpMessage,
				allowance: 0,
				interval: EntInterval.Lifetime,
			}),
			tabToComplete: initEntitlement({
				feature: alexFeatures.tabToComplete,
				allowanceType: AllowanceType.Unlimited,
			}),
			o1Message: initEntitlement({
				feature: alexFeatures.o1Message,
				allowance: 5,
				interval: EntInterval.Lifetime,
			}),
			chatMessage: initEntitlement({
				feature: alexFeatures.chatMessage,
				allowance: 500,
				interval: EntInterval.Month,
			}),
			deepseekMessage: initEntitlement({
				feature: alexFeatures.deepseekMessage,
				allowanceType: AllowanceType.Unlimited,
			}),
			applyCode: initEntitlement({
				feature: alexFeatures.applyCode,
				allowanceType: AllowanceType.Unlimited,
			}),
			gitCommit: initEntitlement({
				feature: alexFeatures.gitCommit,
				allowanceType: AllowanceType.Unlimited,
			}),
			voiceInput: initEntitlement({
				feature: alexFeatures.voiceInput,
				allowanceType: AllowanceType.Unlimited,
			}),
		},
		prices: [],
		freeTrial: null,
	}),
	teamManager: initProduct({
		id: "teamManager",
		isDefault: false,
		isAddOn: true,
		entitlements: {
			topUpMessage: initEntitlement({
				feature: alexFeatures.topUpMessage,
				allowance: 0,
				interval: EntInterval.Lifetime,
			}),
			chatMessage: initEntitlement({
				feature: alexFeatures.chatMessage,
				allowance: 1000,
				interval: EntInterval.Month,
			}),
			deepseekMessage: initEntitlement({
				feature: alexFeatures.deepseekMessage,
				allowanceType: AllowanceType.Unlimited,
			}),
			o1Message: initEntitlement({
				feature: alexFeatures.o1Message,
				allowance: 5,
				interval: EntInterval.Month,
			}),

			applyCode: initEntitlement({
				feature: alexFeatures.applyCode,
				allowanceType: AllowanceType.Unlimited,
			}),
			gitCommit: initEntitlement({
				feature: alexFeatures.gitCommit,
				allowanceType: AllowanceType.Unlimited,
			}),
			voiceInput: initEntitlement({
				feature: alexFeatures.voiceInput,
				allowanceType: AllowanceType.Unlimited,
			}),

			tabToComplete: initEntitlement({
				feature: alexFeatures.tabToComplete,
				allowanceType: AllowanceType.Unlimited,
			}),
			canAddSeats: initEntitlement({
				feature: alexFeatures.canAddSeats,
			}),
			seats: initEntitlement({
				feature: alexFeatures.seats,
				allowance: 0,
				interval: EntInterval.Lifetime,
			}),
		},
		prices: [
			initPrice({
				type: "in_advance",
				amount: 50,
				billingUnits: 1,
				billingInterval: BillingInterval.Month,
				feature: alexFeatures.seats,
			}),
		],
		freeTrial: null,
	}),
};

const orgSlug = process.env.TESTS_ORG!;
before(async function () {
	try {
		this.env = AppEnv.Sandbox;
		const { db, client } = initDrizzle();
		this.db = db;
		this.client = client;
		this.org = await OrgService.getBySlug({
			db: this.db,
			slug: orgSlug,
		});

		const dbFeatures = await FeatureService.list({
			db: this.db,
			orgId: this.org.id,
			env: this.env,
		});

		for (const featureId in alexFeatures) {
			const feature = alexFeatures[featureId as keyof typeof alexFeatures];
			const dbFeature = dbFeatures.find((f: any) => f.id === feature.id);
			if (!dbFeature) {
				continue;
				throw new Error(`Feature ${feature.id} not found`);
			}
			alexFeatures[featureId as keyof typeof alexFeatures].internal_id =
				dbFeature.internal_id;
			if (feature.type === FeatureType.Metered) {
				// Ignore this for now
				alexFeatures[featureId as keyof typeof alexFeatures].eventName =
					dbFeature.event_names?.[0] || dbFeature.id;
			}
		}
	} catch (error) {
		console.error(error);
	}
});

after(async function () {
	await this.client.end();
});
