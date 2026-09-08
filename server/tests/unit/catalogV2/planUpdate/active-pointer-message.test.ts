/**
 * `active: false` with no same-call successor is a plan nobody can buy. The
 * refusal names the plan and says where its rows belong, so an API caller
 * gets the same guidance the CLI's lint gives.
 */

import { expect, test } from "bun:test";
import type { RecaseError, UpdateCatalogParams } from "@autumn/shared";
import { handleUpsertProductActiveErrors } from "@/internal/catalogV2/actions/updateCatalog/errors/handleUpsertProductActiveErrors";

const refusalFor = (params: UpdateCatalogParams): RecaseError | undefined => {
	try {
		handleUpsertProductActiveErrors({ params });
		return undefined;
	} catch (error) {
		return error as RecaseError;
	}
};

test("an inactive row with no active sibling names the plan and where rows belong", () => {
	const error = refusalFor({
		plans: [{ plan_id: "pro", version_slug: "v1", active: false }],
	} as unknown as UpdateCatalogParams);

	expect(error?.statusCode).toBe(400);
	expect(error?.message).toBe(
		'Cannot set active to false on plan "pro": no version of it is active in this update. At least one version of each plan must be active. planVersions is for historical inactive products, and plans is for the active version.',
	);
});

test("an inactive row beside an active sibling of the same plan is accepted", () => {
	expect(
		refusalFor({
			plans: [
				{ plan_id: "pro", version_slug: "v2", active: true },
				{ plan_id: "pro", version_slug: "v1", active: false },
			],
		} as unknown as UpdateCatalogParams),
	).toBeUndefined();
});
