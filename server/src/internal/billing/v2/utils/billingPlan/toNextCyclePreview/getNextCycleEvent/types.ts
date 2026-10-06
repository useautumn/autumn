import type {
	BillingInterval,
	FullCusProduct,
	PhaseProrationBehavior,
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
	| ({
			kind: "anchor_reset";
			startsAtMs: number;
			prorationBehavior: PhaseProrationBehavior | undefined;
	  } & NextCycleEventContext)
	| ({
			kind: "renewal";
			startsAtMs: number;
			customerProducts: FullCusProduct[];
	  } & NextCycleEventContext)
	| ({
			kind: "scheduled_start";
			startsAtMs: number;
			resetsBillingCycle: boolean;
			prorationBehavior: PhaseProrationBehavior | undefined;
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
			renewalBoundaryMs: number;
			resetsBillingCycle: boolean;
			prorationBehavior: PhaseProrationBehavior | undefined;
			incomingCustomerProducts: FullCusProduct[];
			outgoingCustomerProducts: FullCusProduct[];
	  } & NextCycleEventContext);
