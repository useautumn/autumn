import {
	BillingVersion,
	CusProductStatus,
	type CustomerLicenseQuantity,
	type Entity,
	type FeatureOptions,
	type FullCusProduct,
	type FullCustomer,
	type FullProduct,
	truncateMsToSecondPrecision,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { initFullCustomerProduct } from "./initFullCustomerProduct";

export const initScheduledCustomerProduct = ({
	ctx,
	fullCustomer,
	fullProduct,
	featureQuantities,
	customerLicenseQuantities,
	entity,
	startsAt,
	endsAt,
	currentEpochMs,
	accessStartsAt,
	externalId,
	billingCycleAnchorResetsAt,
	subscriptionId,
	subscriptionScheduleId,
	internalEntityId,
}: {
	ctx: AutumnContext;
	fullCustomer: FullCustomer;
	fullProduct: FullProduct;
	featureQuantities: FeatureOptions[];
	customerLicenseQuantities?: CustomerLicenseQuantity[];
	entity?: Entity;
	startsAt: number;
	endsAt: number | null | undefined;
	currentEpochMs: number;
	accessStartsAt?: number;
	externalId?: string;
	billingCycleAnchorResetsAt?: number | null;
	subscriptionId?: string;
	subscriptionScheduleId?: string;
	internalEntityId?: string;
}): FullCusProduct => {
	const startsAtSecondsPrecision = truncateMsToSecondPrecision(startsAt);
	const endsAtSecondsPrecision =
		endsAt === null || endsAt === undefined
			? undefined
			: truncateMsToSecondPrecision(endsAt);

	return initFullCustomerProduct({
		ctx,
		initContext: {
			fullCustomer,
			fullProduct,
			featureQuantities,
			customerLicenseQuantities,
			entity,
			resetCycleAnchor: startsAtSecondsPrecision,
			freeTrial: null,
			now: currentEpochMs,
			billingVersion: BillingVersion.V2,
		},
		initOptions: {
			startsAt: startsAtSecondsPrecision,
			endedAt: endsAtSecondsPrecision,
			status:
				accessStartsAt === undefined ? CusProductStatus.Scheduled : undefined,
			accessStartsAt,
			externalId,
			billingCycleAnchorResetsAt,
			subscriptionId,
			subscriptionScheduleId,
			internalEntityId,
		},
	});
};
