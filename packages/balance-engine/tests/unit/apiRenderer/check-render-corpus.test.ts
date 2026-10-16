import { describe, expect, test } from "bun:test";
import {
	ApiVersion,
	ApiVersionClass,
	AppEnv,
	FeatureType,
	OrgConfigSchema,
	type SharedContext,
} from "@autumn/shared";
import { checkResultToApiResponse } from "../../../src/apiRenderer/check/checkResultToApiResponse.js";
import { computeCheck } from "../../../src/commands/check/computeCheck.js";
import type { Catalog } from "../../../src/models/catalog/catalog.js";
import { subjectStateToFullSubject } from "../../../src/utils/subjectUtils/convertSubjectUtils.js";
import {
	createCatalogFor,
	createCheckCommand,
	createCustomerEntitlement,
	createState,
} from "../engineFixtures.js";

const quiet = {
	debug() {},
	info() {},
	warn() {},
	error() {},
	child() {
		return quiet;
	},
} as unknown as SharedContext["logger"];

/** Customers as Autumn holds them: one balance, many, two rows funding one feature, an empty one. */
const SUBJECTS = {
	oneBalance: [createCustomerEntitlement({ balance: 10 })],
	manyBalances: Array.from({ length: 40 }, (_, i) =>
		createCustomerEntitlement({
			id: i === 0 ? "messages_monthly" : `feature_${i}_monthly`,
			featureId: i === 0 ? "messages" : `feature_${i}`,
			balance: 1_000 + i,
		}),
	),
	twoRowsOneFeature: [
		createCustomerEntitlement({ id: "messages_monthly", balance: 3 }),
		createCustomerEntitlement({ id: "messages_one_off", balance: 7 }),
	],
	empty: [createCustomerEntitlement({ balance: 0 })],
	creditsFundMessages: [
		createCustomerEntitlement({
			id: "credits_row",
			featureId: "credits",
			balance: 50,
		}),
	],
	messagesAndCredits: [
		createCustomerEntitlement({ balance: 2 }),
		createCustomerEntitlement({
			id: "credits_row",
			featureId: "credits",
			balance: 50,
		}),
	],
	creditsFundAnother: [
		createCustomerEntitlement({ balance: 4 }),
		createCustomerEntitlement({
			id: "tokens_row",
			featureId: "tokens",
			balance: 50,
		}),
	],
};

/** `credits` funds messages at 2 credits each; `tokens` is a credit system that funds something else. */
const asCreditSystems = (catalog: Catalog): Catalog => {
	const { feat_credits: credits, feat_tokens: tokens } = catalog.features;
	if (credits) {
		credits.type = FeatureType.CreditSystem;
		credits.config = {
			schema: [{ metered_feature_id: "messages", credit_amount: 2 }],
		};
	}
	if (tokens) {
		tokens.type = FeatureType.CreditSystem;
		tokens.config = {
			schema: [{ metered_feature_id: "images", credit_amount: 1 }],
		};
	}
	return catalog;
};

const VERSIONS = [
	ApiVersion.V2_5,
	ApiVersion.V2_1,
	ApiVersion.V2_0,
	ApiVersion.V1_2,
];

/** Every rendered response in the corpus, as the JSON the API sends. */
const renderCorpus = (): Record<string, string> => {
	const rendered: Record<string, string> = {};
	for (const [name, customerEntitlements] of Object.entries(SUBJECTS)) {
		const state = createState({ customerEntitlements });
		const catalog = asCreditSystems(createCatalogFor({ state }));
		const fullSubject = subjectStateToFullSubject({
			state,
			catalog,
			entityId: null,
		});
		for (const version of VERSIONS)
			for (const expand of [[], ["balance.feature"]])
				for (const requiredBalance of [1, 5, 50])
					for (const isDeductingCheck of [false, true]) {
						const command = createCheckCommand({ requiredBalance });
						const result = computeCheck({ fullSubject, command });
						const { response } = checkResultToApiResponse({
							ctx: {
								org: {
									config: OrgConfigSchema.parse({}),
									default_currency: "usd",
								},
								env: AppEnv.Sandbox,
								features: Object.values(catalog.features),
								logger: quiet,
								expand,
							},
							apiVersion: new ApiVersionClass(version),
							command,
							result,
							fullSubject,
							isDeductingCheck,
						});
						rendered[
							`${name} v${version} expand=${expand.join(",")} required=${requiredBalance} deducting=${isDeductingCheck}`
						] = JSON.stringify(response);
					}
	}
	return rendered;
};

describe("a check's API response", () => {
	test("renders byte for byte as before, across subjects, versions, expands and deducting checks", () => {
		expect(renderCorpus()).toMatchSnapshot();
	});
});
