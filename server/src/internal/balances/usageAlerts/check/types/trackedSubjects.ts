import type { FullCustomer, FullSubject } from "@autumn/shared";
import type { BeforeAfter } from "./beforeAfter.js";

export type TrackedSubject = {
	fullCustomer: FullCustomer;
	fullSubject?: FullSubject;
};

export type TrackedSubjects = BeforeAfter<TrackedSubject>;
