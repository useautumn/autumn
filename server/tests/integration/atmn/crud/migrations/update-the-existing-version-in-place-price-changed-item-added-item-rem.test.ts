/**
 * atmn crud/migrations — update the existing version in place [price changed, item added, item removed, trial changed, license included changed] with customers on it → migration drafted: preview names it, applied result names it, one undrafted migration row persists
 *
 * the `versionedPro` base config: base price, prepaid seat item, usage item, trial, seat license; every line has customers attached
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

test.todo("update the existing version in place [price changed, item added, item removed, trial changed, license included changed] with customers on it \u2192 migration drafted: preview names it, applied result names it, one undrafted migration row persists", () => {});
