/**
 * atmn scenarios/lint — one failing config per rule kind [requiredWhen, forbiddenWhen, mutex, exactlyOne, unique, exists, compare, valueWhen, targetHas] → all collected, nothing sent
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

test.todo("one failing config per rule kind [requiredWhen, forbiddenWhen, mutex, exactlyOne, unique, exists, compare, valueWhen, targetHas] \u2192 all collected, nothing sent", () => {});
