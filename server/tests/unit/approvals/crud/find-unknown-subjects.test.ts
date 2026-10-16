/**
 * A rule can only name roles that exist and users who are members (Stage 3, D2a).
 */

import { expect, test } from "bun:test";
import { findUnknownSubjects } from "@/internal/approvals/utils/findUnknownSubjects.js";

test("unknown roles and non-members are issues at their subject", () => {
	expect(
		findUnknownSubjects({
			subjects: [
				{ type: "everyone" },
				{ type: "role", role_id: "sales" },
				{ type: "role", role_id: "ghost" },
				{ type: "user", user_id: "usr_member" },
				{ type: "user", user_id: "usr_outsider" },
			],
			roleIds: new Set(["sales"]),
			memberUserIds: new Set(["usr_member"]),
		}).map((issue) => issue.path),
	).toEqual(["subjects.2.role_id", "subjects.4.user_id"]);
});
