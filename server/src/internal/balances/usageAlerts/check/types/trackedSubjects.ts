import type { BeforeAfter } from "@autumn/balance-webhooks";
import type { FullCustomer, FullSubject } from "@autumn/shared";

export type TrackedSubject = {
	fullCustomer: FullCustomer;
	fullSubject?: FullSubject;
};

export type TrackedSubjects = BeforeAfter<TrackedSubject>;
