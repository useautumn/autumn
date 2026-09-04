/**
 * atmn crud/versions — v2 in plans, v1 in planVersions → two versions, v2 active; assert the server's numbering (creation order, v1 = version 2)
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

test.todo("v2 in plans, v1 in planVersions \u2192 two versions, v2 active; assert the server's numbering (creation order, v1 = version 2)", () => {});
