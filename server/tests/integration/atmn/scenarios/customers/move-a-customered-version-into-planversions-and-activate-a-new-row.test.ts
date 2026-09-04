/**
 * atmn scenarios/customers — move a customered version into planVersions and activate a new row → customers stay on the old version, new attaches get the new one
 *
 * real `billing.attach` first; the point is to hit the dependency errors
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

test.todo("move a customered version into planVersions and activate a new row \u2192 customers stay on the old version, new attaches get the new one", () => {});
