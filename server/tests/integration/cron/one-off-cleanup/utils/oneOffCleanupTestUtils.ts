import { expect } from "bun:test";
import {
	ALL_STATUSES,
	type CusProductStatus,
	type FullCustomer,
} from "@autumn/shared";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { s } from "@tests/utils/testInitUtils/initScenario.js";
import type { AutumnInt } from "@/external/autumn/autumnCli.js";
import { CusService } from "@/internal/customers/CusService.js";

type TrackParams = Parameters<AutumnInt["track"]>[0];

export const trackUsageForCleanup = async (
	autumnV1: Pick<AutumnInt, "track">,
	params: TrackParams,
) => {
	await autumnV1.track(params, { skipCache: true });
};

export const oneOffCleanupCustomer = () =>
	s.customer({ paymentMethod: "success", testClock: false });

export const getFullCustomerWithExpired = async (
	customerId: string,
): Promise<FullCustomer> => {
	return await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
		inStatuses: ALL_STATUSES,
	});
};

export const expectProductStatusesByOrder = ({
	fullCus,
	productId,
	expectedStatuses,
}: {
	fullCus: FullCustomer;
	productId: string;
	expectedStatuses: CusProductStatus[];
}): void => {
	const cusProducts = fullCus.customer_products
		.filter((cp) => cp.product.id === productId)
		.sort((a, b) => (a.created_at ?? 0) - (b.created_at ?? 0));

	expect(cusProducts.length).toBe(expectedStatuses.length);

	for (let i = 0; i < expectedStatuses.length; i++) {
		expect(cusProducts[i].status).toBe(expectedStatuses[i]);
	}
};
