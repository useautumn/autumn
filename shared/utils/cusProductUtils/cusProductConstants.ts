import { CusProductStatus } from "../../models/cusProductModels/cusProductEnums.js";

export const ACTIVE_STATUSES = [
	CusProductStatus.Active,
	CusProductStatus.PastDue,
];

export const RELEVANT_STATUSES = [
	CusProductStatus.Active,
	CusProductStatus.PastDue,
	CusProductStatus.Scheduled,
];

export const VERSIONABLE_CUSTOMER_STATUSES = [
	CusProductStatus.Active,
	CusProductStatus.PastDue,
	CusProductStatus.Scheduled,
	CusProductStatus.Paused,
];

export const ALL_STATUSES = [
	CusProductStatus.Scheduled,
	CusProductStatus.Active,
	CusProductStatus.PastDue,
	CusProductStatus.Paused,
	CusProductStatus.Expired,
];

// PastDue retains pools/assignments (dunning must not revoke); Trialing
// parents may still assign, but assignments themselves are always Active.
export const LICENSE_PARENT_STATUSES = [
	CusProductStatus.Active,
	CusProductStatus.PastDue,
	CusProductStatus.Trialing,
];

export const LICENSE_ACTIVE_ASSIGNMENT_STATUSES = [
	CusProductStatus.Active,
	CusProductStatus.PastDue,
];

export const LICENSE_ASSIGNABLE_STATUSES = [CusProductStatus.Active];
