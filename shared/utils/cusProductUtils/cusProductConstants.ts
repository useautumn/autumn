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

export const ATTACH_CONFLICT_STATUSES = [
	...RELEVANT_STATUSES,
	CusProductStatus.Pending,
];

export const STRIPE_LINKED_STATUSES = [
	...RELEVANT_STATUSES,
	CusProductStatus.Paused,
];

export const VERSIONABLE_CUSTOMER_STATUSES = [
	CusProductStatus.Active,
	CusProductStatus.PastDue,
	CusProductStatus.Scheduled,
	CusProductStatus.Paused,
];

export const REFERENCED_ROW_CUSTOMER_STATUSES = [
	...VERSIONABLE_CUSTOMER_STATUSES,
	CusProductStatus.Expired,
];

export const MIGRATABLE_STATUSES = [
	CusProductStatus.Active,
	CusProductStatus.PastDue,
	CusProductStatus.Scheduled,
	CusProductStatus.Paused,
];

export const ALL_STATUSES = [
	CusProductStatus.Scheduled,
	CusProductStatus.Pending,
	CusProductStatus.Active,
	CusProductStatus.PastDue,
	CusProductStatus.Paused,
	CusProductStatus.Expired,
];
