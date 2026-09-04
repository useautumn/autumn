/**
 * atmn scenarios/archive — archived parent plan + archived license plan both restored in one push [parent listed first, license plan listed first] → both active, link intact, no order dependence
 *
 * one push carries the whole batch, so restore order must not matter
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

test.todo("archived parent plan + archived license plan both restored in one push [parent listed first, license plan listed first] \u2192 both active, link intact, no order dependence", () => {});
