/**
 * atmn crud/migrations — update all versions [the item added to the v1 and v2 rows in planVersions and the v3 row in plans] → three in-place updates, one migration per customered version, no new version; nothing is asked at push time, the diff says it all
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

test.todo("update all versions [the item added to the v1 and v2 rows in planVersions and the v3 row in plans] \u2192 three in-place updates, one migration per customered version, no new version; nothing is asked at push time, the diff says it all", () => {});
