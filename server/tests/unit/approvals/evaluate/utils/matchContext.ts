import type { FilterMatchContext } from "@autumn/shared/api/approvals/evaluate/index.js";
import { principals } from "./principals.js";

export const MATCH_NOW = new Date("2026-10-15T12:00:00Z");

/** The member is threaded through but unused in v1, so one fixed member serves every test. */
export const matchContext: FilterMatchContext = {
	principal: principals.member({ roleId: "sales" }),
	now: MATCH_NOW,
};
