/**
 * CPU per check render on a resend-like subject (40 balances): the API's response for a read check and a deducting one.
 * `bun run bench:render [renders]`.
 */
import {
	ApiVersion,
	ApiVersionClass,
	AppEnv,
	OrgConfigSchema,
	type SharedContext,
} from "@autumn/shared";
import { checkResultToApiResponse } from "../../src/apiRenderer/check/checkResultToApiResponse.js";
import { computeCheck } from "../../src/commands/check/computeCheck.js";
import { subjectStateToFullSubject } from "../../src/utils/subjectUtils/convertSubjectUtils.js";
import {
	createCatalogFor,
	createCheckCommand,
	createCustomerEntitlement,
	createState,
} from "../unit/engineFixtures.js";

const renders = Number(process.argv[2] ?? 20_000);
const state = createState({
	customerEntitlements: Array.from({ length: 40 }, (_, i) =>
		createCustomerEntitlement({
			id: i === 0 ? "messages_monthly" : `feature_${i}_monthly`,
			featureId: i === 0 ? "messages" : `feature_${i}`,
			balance: 1_000_000,
		}),
	),
});
const catalog = createCatalogFor({ state });
const fullSubject = subjectStateToFullSubject({
	state,
	catalog,
	entityId: null,
});
const ctx = {
	org: { config: OrgConfigSchema.parse({}), default_currency: "usd" },
	env: AppEnv.Sandbox,
	features: Object.values(catalog.features),
	logger: console,
	expand: [],
} as unknown as SharedContext;
const command = createCheckCommand({ requiredBalance: 1 });
const result = computeCheck({ fullSubject, command });
const apiVersion = new ApiVersionClass(ApiVersion.V2_5);

const microsPerRender = (isDeductingCheck: boolean) => {
	for (let i = 0; i < 2_000; i++)
		checkResultToApiResponse({
			ctx,
			apiVersion,
			command,
			result,
			fullSubject,
			isDeductingCheck,
		});
	const startedAt = performance.now();
	for (let i = 0; i < renders; i++)
		checkResultToApiResponse({
			ctx,
			apiVersion,
			command,
			result,
			fullSubject,
			isDeductingCheck,
		});
	return Number(
		(((performance.now() - startedAt) * 1000) / renders).toFixed(1),
	);
};

console.log(
	JSON.stringify({
		renders,
		readCheckMicros: microsPerRender(false),
		deductingCheckMicros: microsPerRender(true),
	}),
);
