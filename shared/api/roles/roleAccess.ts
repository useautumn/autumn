import { z } from "zod/v4";
import { RESOURCES } from "../../utils/scopeDefinitions.js";

export const RoleAccessSchema = z.enum(["none", "read", "write"]);
export type RoleAccess = z.infer<typeof RoleAccessSchema>;

/** Coarse access per resource; every resource in `RESOURCES` must be set. */
export const RoleAccessMapSchema = z
	.object(
		Object.fromEntries(
			RESOURCES.map((resource) => [resource, RoleAccessSchema]),
		) as {
			[R in (typeof RESOURCES)[number]]: typeof RoleAccessSchema;
		},
	)
	.refine((access) => access.analytics !== "write", {
		message: "Analytics access is read-only.",
		path: ["analytics"],
	})
	// A role with no access resolves to no scopes, so its members could do nothing.
	.refine((access) => Object.values(access).some((level) => level !== "none"), {
		message: "A role needs access to at least one resource.",
	});
export type RoleAccessMap = z.infer<typeof RoleAccessMapSchema>;
