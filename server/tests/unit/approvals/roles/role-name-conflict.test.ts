/**
 * A concurrent save that loses the role-name race reports 409 role_exists, not a 500.
 */

import { expect, test } from "bun:test";
import { ErrCode, RecaseError } from "@autumn/shared";
import { withRoleNameConflictAsRoleExists } from "@/internal/roles/errors/withRoleNameConflictAsRoleExists.js";

const uniqueViolation = (constraint: string) =>
	Object.assign(new Error("duplicate key"), { code: "23505", constraint });

test("role name unique violation becomes role_exists; other errors pass through", async () => {
	const conflict = await withRoleNameConflictAsRoleExists({
		name: "support",
		write: () =>
			Promise.reject(
				new Error("Failed query", {
					cause: uniqueViolation("organization_role_org_role_key"),
				}),
			),
	}).catch((e) => e);
	expect(conflict).toBeInstanceOf(RecaseError);
	expect(conflict).toMatchObject({ code: ErrCode.RoleExists, statusCode: 409 });

	const other = uniqueViolation("organization_role_pkey");
	await expect(
		withRoleNameConflictAsRoleExists({
			name: "support",
			write: () => Promise.reject(other),
		}),
	).rejects.toBe(other);
});
