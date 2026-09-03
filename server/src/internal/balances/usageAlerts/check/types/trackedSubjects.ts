import type { FullCustomer, FullSubject } from "@autumn/shared";

export type TrackedSubject = {
	fullCustomer: FullCustomer;
	fullSubject?: FullSubject;
};

export type TrackedSubjects = {
	before: TrackedSubject;
	after: TrackedSubject;
};
