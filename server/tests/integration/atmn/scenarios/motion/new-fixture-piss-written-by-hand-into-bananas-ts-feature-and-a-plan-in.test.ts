/**
 * atmn scenarios/motion — new fixture `piss` written by hand into `bananas.ts` (feature) [and a plan into `strawberries.ts`, a version into `poo.ts`] → push creates it; the backfill seeks out that file and inserts the single `internalId` line into that fixture, nothing else in the file changes
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

test.todo("new fixture `piss` written by hand into `bananas.ts` (feature) [and a plan into `strawberries.ts`, a version into `poo.ts`] \u2192 push creates it; the backfill seeks out that file and inserts the single `internalId` line into that fixture, nothing else in the file changes", () => {});
