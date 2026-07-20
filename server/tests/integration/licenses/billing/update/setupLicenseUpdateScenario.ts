import type { AttachLicenseParamsV0, ProductItem } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";

/** Parent plan linked to a dev-seat license, attached with paid seats. */
export const setupLicenseUpdateScenario = async ({
	customerId,
	idPrefix,
	parentItems = [items.dashboard()],
	seatPrice,
	seatItems,
	includedSeats,
	attachedSeats,
}: {
	customerId: string;
	idPrefix: string;
	parentItems?: ProductItem[];
	seatPrice?: number;
	/** Extra seat items beyond the monthly base price (e.g. a usage grant). */
	seatItems?: ProductItem[];
	includedSeats: number;
	attachedSeats: number;
}) => {
	const parent = products.base({
		id: `${idPrefix}-pro`,
		items: parentItems,
	});
	const devSeat = products.base({
		id: `${idPrefix}-dev-seat`,
		items: [
			...(seatPrice === undefined
				? []
				: [items.monthlyPrice({ price: seatPrice })]),
			...(seatItems ?? []),
		],
		group: `${idPrefix}-dev-seat-licenses`,
	});

	const scenario = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", testClock: false }),
			s.products({ list: [parent, devSeat] }),
		],
		actions: [
			s.licenses.link({
				parentProductId: parent.id,
				licenseProductId: devSeat.id,
				included: includedSeats,
			}),
			s.billing.attach({
				productId: parent.id,
				licenseQuantities: [
					{ licenseProductId: devSeat.id, quantity: attachedSeats },
				],
			}),
		],
	});

	const assignSeats = async ({ count }: { count: number }) =>
		scenario.autumnV2_3.licenses.attach<AttachLicenseParamsV0>({
			customer_id: customerId,
			plan_id: devSeat.id,
			entities: Array.from({ length: count }, (_, index) => ({
				entity_id: `${idPrefix}-entity-${index + 1}`,
				name: `Seat ${index + 1}`,
				feature_id: TestFeature.Users,
			})),
		});

	return { ...scenario, idPrefix, parent, devSeat, assignSeats };
};
