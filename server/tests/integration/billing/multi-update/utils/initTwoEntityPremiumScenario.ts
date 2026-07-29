import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";

/**
 * Two entities on Premium ($50/mo each, one shared subscription). With
 * `withEntity1Downgrade`, entity 1 also downgrades Premium -> Pro ($20/mo):
 * Premium@e1 canceling with Pro@e1 scheduled (subscription schedule in play).
 */
export const initTwoEntityPremiumScenario = async ({
	customerId,
	withEntity1Downgrade = false,
}: {
	customerId: string;
	withEntity1Downgrade?: boolean;
}) => {
	const premium = products.premium({
		id: "premium",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});
	const pro = products.pro({
		id: "pro",
		items: [items.monthlyMessages({ includedUsage: 50 })],
	});

	const scenario = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [premium, pro] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.attach({ productId: premium.id, entityIndex: 0 }),
			s.attach({ productId: premium.id, entityIndex: 1 }),
			...(withEntity1Downgrade
				? [s.attach({ productId: pro.id, entityIndex: 0 })]
				: []),
		],
	});

	return { ...scenario, premium, pro };
};
