import { readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import { core } from "./core";
import { coreAttach } from "./core/coreAttach";
import { coreBalances } from "./core/coreBalances";
import { coreLegacy } from "./core/coreLegacy";
import { coreMigrations } from "./core/coreMigrations";
import { coreStripe } from "./core/coreStripe";
import { coreUpdateSubscription } from "./core/coreUpdateSubscription";
import { advanced } from "./domains/advanced";
import { balances } from "./domains/balances/balances";
import { check } from "./domains/balances/check";
import { track } from "./domains/balances/track";
import { updateBalance } from "./domains/balances/updateBalance";
import { billing } from "./domains/billing/billing";
import { billingV1 } from "./domains/billing/billingV1";
import { billingV2 } from "./domains/billing/billingV2";
import { prepaidVolume } from "./domains/billing/prepaidVolume";
import { crud } from "./domains/crud";
import { misc } from "./domains/misc";
import { webhooks } from "./domains/webhooks";
import { suites } from "./suites";
import type { TestGroup, TestSuite } from "./types";

export type { TestGroup, TestSuite, TestTier } from "./types";

const allGroups: TestGroup[] = [
	core,
	coreAttach,
	coreBalances,
	coreLegacy,
	coreMigrations,
	coreStripe,
	coreUpdateSubscription,
	balances,
	check,
	track,
	updateBalance,
	billing,
	billingV1,
	billingV2,
	prepaidVolume,
	crud,
	webhooks,
	advanced,
	misc,
];

export const getAllGroups = (): TestGroup[] => allGroups;

export const getGroup = ({ name }: { name: string }): TestGroup | undefined =>
	allGroups.find((g) => g.name === name);

export const getAllSuites = (): TestSuite[] => suites;

export const getSuite = ({ name }: { name: string }): TestSuite | undefined =>
	suites.find((s) => s.name === name);

/** Resolve a suite to its constituent test groups. */
export const resolveSuite = ({
	name,
}: {
	name: string;
}): TestGroup[] | undefined => {
	const suite = getSuite({ name });
	if (!suite) return undefined;

	return suite.groups
		.map((groupName) => getGroup({ name: groupName }))
		.filter((g): g is TestGroup => g !== undefined);
};

/** Resolve a name to test paths -- checks groups first, then suites. */
export const resolveTestPaths = ({
	name,
}: {
	name: string;
}): string[] | undefined => {
	const group = getGroup({ name });
	if (group) return group.paths;

	const suiteGroups = resolveSuite({ name });
	if (suiteGroups) {
		const paths = suiteGroups.flatMap((g) => g.paths);
		return [...new Set(paths)];
	}

	return undefined;
};

/** Recursively discover all *.test.ts files under a directory. */
export const discoverAllTestFiles = async ({
	testsDir,
}: {
	testsDir: string;
}): Promise<string[]> => {
	const results: string[] = [];

	const walk = async ({ dir }: { dir: string }) => {
		const entries = await readdir(dir, { withFileTypes: true });
		for (const entry of entries) {
			const fullPath = join(dir, entry.name);
			if (entry.isDirectory()) {
				if (
					entry.name.startsWith(".") ||
					entry.name.startsWith("_") ||
					entry.name === "node_modules"
				) {
					continue;
				}
				await walk({ dir: fullPath });
			} else if (entry.name.endsWith(".test.ts")) {
				results.push(relative(testsDir, fullPath));
			}
		}
	};

	await walk({ dir: testsDir });
	return results.sort();
};
