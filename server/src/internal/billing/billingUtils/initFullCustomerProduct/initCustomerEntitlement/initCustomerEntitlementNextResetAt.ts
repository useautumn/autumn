import {
	type EntitlementWithFeature,
	type InsertFullCusProductContext,
	isBooleanEntitlement,
	isLifetimeEntitlement,
	isUnlimitedEntitlement,
} from "@autumn/shared";

export const initCusEntitlementNextResetAt = ({
	insertContext,
	entitlement,
}: {
	insertContext: InsertFullCusProductContext;
	entitlement: EntitlementWithFeature;
}) => {
	// 1. If entitlement is boolean, or unlimited, or lifetime, then next reset at is null
	const isLifetime = isLifetimeEntitlement({ entitlement });
	const isUnlimited = isUnlimitedEntitlement({ entitlement });
	const isBoolean = isBooleanEntitlement({ entitlement });
	if (isLifetime || isUnlimited || isBoolean) return null;

	// 2. If next reset at override is provided, return it?

	// // 3. Get next reset at:
	// let nextResetAtCalculated = null;
	// const trialEndTimestamp = trialEndsAt
	// 	? Math.round(trialEndsAt / 1000)
	// 	: freeTrial
	// 		? freeTrialToStripeTimestamp({ freeTrial, now })
	// 		: null;

	// const shouldApplyTrial = applyTrialToEntitlement(entitlement, freeTrial);

	// // console.log(
	// // 	"Trial end timestamp: ",
	// // 	formatUnixToDateTime(trialEndTimestamp! * 1000),
	// // );

	// if (freeTrial && shouldApplyTrial && trialEndTimestamp) {
	// 	nextResetAtCalculated = new UTCDate(trialEndTimestamp! * 1000);
	// }

	// const resetInterval = entitlement.interval as EntInterval;

	// const startDate = nextResetAtCalculated || new UTCDate(now);
	// nextResetAtCalculated = getNextEntitlementReset(
	// 	startDate,
	// 	resetInterval,
	// 	entitlement.interval_count || 1,
	// ).getTime();

	// // console.log(
	// // 	"Next reset at calculated: ",
	// // 	formatUnixToDateTime(nextResetAtCalculated),
	// // );

	// // If anchorToUnix, align next reset at to anchorToUnix...
	// if (
	// 	anchorToUnix &&
	// 	nextResetAtCalculated &&
	// 	Object.values(BillingInterval).includes(
	// 		entitlement.interval as unknown as BillingInterval,
	// 	) &&
	// 	!shouldApplyTrial
	// ) {
	// 	nextResetAtCalculated = getAlignedUnix({
	// 		anchor: anchorToUnix,
	// 		intervalConfig: {
	// 			interval: entitlement.interval as unknown as BillingInterval,
	// 			intervalCount: entitlement.interval_count || 1,
	// 		},
	// 		now,
	// 	});
	// }

	// return nextResetAtCalculated;
};
