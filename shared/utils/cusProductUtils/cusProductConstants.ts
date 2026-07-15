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
