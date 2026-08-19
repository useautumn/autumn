import type { BillingInterval, CreatePlanItemParamsV1Input } from "@autumn/shared";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import {
	expectCatalogPreviewCorrect,
	expectCatalogResultsCorrect,
} from "../../../utils/expectCatalogUpdate.js";
import {
	deleteDbPlans,
	type ExpectedPlanItem,
	expectCatalogPlansCorrect,
	expectDbPlansAbsent,
} from "../../utils/expectCatalogPlans.js";

type BasePriceParams = {
	amount: number;
	interval: BillingInterval;
	interval_count?: number;
	additional_currencies?: Array<{ currency: string; amount: number }>;
};

/** Preview → create → assert exact round-trip via catalogV2.get, then clean up. */
export const createAndAssert = async ({
	planId,
	name,
	items,
	price,
	expectedItems,
	expectedBasePrice,
}: {
	planId: string;
	name: string;
	items: CreatePlanItemParamsV1Input[];
	price?: BasePriceParams;
	expectedItems: ExpectedPlanItem[];
	expectedBasePrice?: BasePriceParams | null;
}) => {
	const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
	const params = {
		plans: [
			{
				plan_id: planId,
				name,
				...(price ? { price } : {}),
				items,
			},
		],
	};

	await deleteDbPlans({ ctx, planIds: [planId] });
	try {
		const preview = await autumnV2_3.catalogV2.previewUpdate(params);
		expectCatalogPreviewCorrect({
			preview,
			plans: [{ planId, action: "create" }],
		});
		await expectDbPlansAbsent({ ctx, planIds: [planId] });

		const response = await autumnV2_3.catalogV2.update(params);
		expectCatalogResultsCorrect({
			response,
			plans: [{ id: planId, action: "create" }],
		});
		await expectCatalogPlansCorrect({
			autumn: autumnV2_3,
			expected: [
				{
					id: planId,
					version: 1,
					name,
					items: expectedItems,
					...(expectedBasePrice !== undefined
						? { basePrice: expectedBasePrice }
						: {}),
				},
			],
		});
	} finally {
		await deleteDbPlans({ ctx, planIds: [planId] });
	}
};
