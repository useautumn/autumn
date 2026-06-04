import type {
	BillingInterval,
	FullCusProduct,
} from "@autumn/shared";

export type SmallestInterval = {
	interval: BillingInterval;
	intervalCount: number;
};

type NextCycleEventContext = {
	smallestInterval: SmallestInterval;
};

export type NextCycleEvent =
	| { kind: "none" }
	| ({ kind: "anchor_reset" } & NextCycleEventContext)
	| ({
			kind: "renewal";
			startsAtMs: number;
			customerProducts: FullCusProduct[];
	  } & NextCycleEventContext)
	| ({
			kind: "scheduled_start";
			startsAtMs: number;
			customerProducts: FullCusProduct[];
	  } & NextCycleEventContext)
	| ({
			kind: "trial_end";
			startsAtMs: number;
			customerProducts: FullCusProduct[];
	  } & NextCycleEventContext)
	| ({
			kind: "scheduled_change";
			startsAtMs: number;
			incomingCustomerProducts: FullCusProduct[];
			outgoingCustomerProducts: FullCusProduct[];
	  } & NextCycleEventContext);
