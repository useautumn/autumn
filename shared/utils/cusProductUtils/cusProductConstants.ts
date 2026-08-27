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

/** cus_ent / cus_price rows that still FK catalog ents/prices. */
export const REFERENCED_ROW_CUSTOMER_STATUSES = [
	...VERSIONABLE_CUSTOMER_STATUSES,
	CusProductStatus.Expired,
];

/** Customer products migrations may mutate — everything except expired. */
export const MIGRATABLE_STATUSES = [
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
