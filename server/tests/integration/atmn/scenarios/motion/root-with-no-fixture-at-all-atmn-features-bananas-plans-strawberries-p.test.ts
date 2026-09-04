/**
 * atmn scenarios/motion — root with no fixture at all: `atmn({ features: bananas, plans: strawberries, planVersions: [...poo, ...pee] })` over `bananas.ts`, `strawberries.ts`, `poo.ts`, `pee.ts` → a remote-only feature → `bananas.ts` becomes `[...bananas, feature(...)]`; a remote-only plan → `strawberries.ts`; a remote-only version → the last spread's array (`pee.ts`); the root is byte-identical
 *
 * code in motion: the config's shape is the user's; pull edits the AST, never rewrites a file
 *
 * One line of plans/atmn-v3/07_tests.md. [a, b] is a matrix looped INSIDE this file.
 */

import { expect, test } from "bun:test";
import {
	configBody,
	enterpriseWithSeats,
	everyFeatureType,
	freePlan,
	paidMonthly,
	seatPlan,
	versionedPro,
} from "@tests/utils/atmnUtils/baseConfigs.js";
import { expectPreviewNone, expectRoundTrip } from "@tests/utils/atmnUtils/expectRoundTrip.js";
import { atmnImports, initAtmnScenario } from "@tests/utils/atmnUtils/initAtmnScenario.js";
import { s } from "@tests/utils/testInitUtils/initScenario.js";

test.todo("root with no fixture at all: `atmn({ features: bananas, plans: strawberries, planVersions: [...poo, ...pee] })` over `bananas.ts`, `strawberries.ts`, `poo.ts`, `pee.ts` \u2192 a remote-only feature \u2192 `bananas.ts` becomes `[...bananas, feature(...)]`; a remote-only plan \u2192 `strawberries.ts`; a remote-only version \u2192 the last spread's array (`pee.ts`); the root is byte-identical", () => {});
