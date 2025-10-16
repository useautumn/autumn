/**
 * Shared enums for Plan API to avoid circular dependencies
 */

export enum ResetInterval {
	OneOff = "one_off",
	Minute = "minute",
	Hour = "hour",
	Day = "day",
	Week = "week",
	Month = "month",
	Quarter = "quarter",
	SemiAnnual = "semi_annual",
	Year = "year",
}