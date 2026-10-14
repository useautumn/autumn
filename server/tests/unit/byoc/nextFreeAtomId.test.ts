import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { SHADOW_ATOM_OWNER } from "@/internal/byoc/utils/byocCacheUtils.js";
import { nextFreeAtomId } from "@/internal/byoc/utils/nextFreeAtomId.js";
import { startableShadowAtomNames } from "@/internal/misc/shadowAtom/shadowAtomNames.js";
import type { ShadowAtomRecord } from "@/internal/misc/shadowAtom/types/shadowAtomRecord.js";

const B55EE = "atom_b55ee51c6af650dd1aefc172";
const DD3D20BD = "atom_dd3d20bd53fb6cf8c54e4865";

const withGroups = (externalIds: string[]) => ({
	hasGroup: async ({ externalId }: { externalId: string }) =>
		externalIds.includes(externalId),
});

describe("the next Atom id apart from leftover groups", () => {
	const originalPrefix = process.env.ATOM_DEPLOYMENT_PREFIX;
	beforeEach(() => {
		delete process.env.ATOM_DEPLOYMENT_PREFIX;
	});
	afterAll(() => {
		if (originalPrefix === undefined) delete process.env.ATOM_DEPLOYMENT_PREFIX;
		else process.env.ATOM_DEPLOYMENT_PREFIX = originalPrefix;
	});

	test("with one Atom being removed the bare id alternates: previous [b55ee…] names dd3d20bd…", async () => {
		expect(
			await nextFreeAtomId({
				owner: SHADOW_ATOM_OWNER,
				existingAtomIds: [],
				deployer: withGroups([]),
			}),
		).toBe(B55EE);
		expect(
			await nextFreeAtomId({
				owner: SHADOW_ATOM_OWNER,
				existingAtomIds: [B55EE],
				deployer: withGroups([]),
			}),
		).toBe(DD3D20BD);
	});

	test("dd3d20bd…'s group outliving its record is skipped, so the Atom takes a fresh id and group", async () => {
		const names = await startableShadowAtomNames({
			previous: [{ atom_id: B55EE } as ShadowAtomRecord],
			deployer: withGroups([`autumn-internal-shadow-atom.${DD3D20BD}`]),
		});

		expect(names.atomId).not.toBe(DD3D20BD);
		expect(names.atomId).toBe("atom_001e8754e924c479a2f58865");
		expect(names.externalId).toBe(
			"autumn-internal-shadow-atom.atom_001e8754e924c479a2f58865",
		);
	});

	test("an owner with more leftover groups than any id it could take is refused", async () => {
		await expect(
			nextFreeAtomId({
				owner: SHADOW_ATOM_OWNER,
				existingAtomIds: [],
				deployer: { hasGroup: async () => true },
			}),
		).rejects.toThrow("leftover Atom deployment groups");
	});
});
