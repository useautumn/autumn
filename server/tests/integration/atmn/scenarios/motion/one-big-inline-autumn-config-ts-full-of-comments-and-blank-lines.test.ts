/**
 * atmn scenarios/motion — one big inline `autumn.config.ts` full of comments and blank lines → a plan added remotely → pull appends one fixture to `plans`; the diff of the file is exactly that appended literal
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

test.todo("one big inline `autumn.config.ts` full of comments and blank lines \u2192 a plan added remotely \u2192 pull appends one fixture to `plans`; the diff of the file is exactly that appended literal", () => {});
