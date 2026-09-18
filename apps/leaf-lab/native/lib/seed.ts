import { BillingInterval } from "@autumn/shared";
import { createSetup } from "../../../leaf/tests/evals/fixtures/createSetup.js";
import { knowledgePlatformSetup } from "../../../leaf/tests/evals/fixtures/setups/knowledgePlatformSetup.js";

export const NATIVE_SEED_PROVENANCE = {
	pro: "server/tests/integration/billing/generateRequest/generate-billing-request.test.ts: gen-attach-multi and gen-attach-trial use products.pro; server/tests/utils/fixtures/products.ts specifies $20/month",
	catalog:
		"apps/leaf/tests/evals/fixtures/setups/knowledgePlatformSetup.ts: Scale, Enterprise and feature economics",
	growth:
		"Modeled alias of the knowledge-platform Launch plan, not a recovered historical Growth catalog record",
	customers:
		"Native eval identifiers; modeled empty sandbox customers, not recovered production subscription/payment state",
	units:
		"The corrected fixture basePrice factory and item prices are in major currency units; native copies those amounts without conversion",
	limitations:
		"Modeled org, not a faithful replay of the original native sandbox. Preview totals are simplified fixture outputs, not processor-calculated financial quotes.",
} as const;

export const createNativeSeed = () => {
	const catalog = knowledgePlatformSetup();
	return createSetup({
		tag: "native-modeled-sandbox",
		features: () => catalog.refs.features,
		plans: ({ plan }) => {
			const plans = catalog.refs.plans;
			const pro = plan.monthly({
				planId: "pro_gen-attach-multi",
				name: "Pro",
				basePrice: {
					interval: BillingInterval.Month,
					amount: 20,
					display: { primary_text: "$20", secondary_text: "per month" },
				},
			});
			return {
				...plans,
				pro,
				proTrial: { ...pro, id: "pro_gen-attach-trial" },
				growth: { ...plans.launch, id: "growth", name: "Growth" },
			};
		},
		customers: ({ customers }) =>
			Object.fromEntries(
				[
					"gen-attach-multi",
					"gen-attach-trial",
					"2094584-eval",
					"exec-mt2unrns-b",
				].map((id) => [
					id,
					customers.base({ id, name: id, email: `billing+${id}@example.test` }),
				]),
			),
	});
};
