/**
 * atmn scenarios/versions — v2 active, v1 pushed later into planVersions (server numbers it higher) → pull leaves v1 where it is, never a draft (today's bug)
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

test.todo("v2 active, v1 pushed later into planVersions (server numbers it higher) \u2192 pull leaves v1 where it is, never a draft (today's bug)", () => {});
