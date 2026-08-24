import { expect } from "bun:test";
import type { ApiPlanV1 } from "@autumn/shared";

/** Assert GET plan identity fields — only checks values that are passed. */
export const expectApiPlanVersionIdentityCorrect = ({
	plan,
	version,
	versionSlug,
	active,
}: {
	plan: ApiPlanV1 | undefined;
	version?: number;
	versionSlug?: string;
	active?: boolean;
}) => {
	expect(plan).toBeDefined();
	if (version !== undefined) expect(plan?.version).toBe(version);
	if (versionSlug !== undefined) expect(plan?.version_slug).toBe(versionSlug);
	if (active !== undefined) expect(plan?.active).toBe(active);
};
