/**
 * atmn crud/plans/rename — rename all versions of another plan [v1 and v2 in planVersions, v3 in plans, every row renamed by its internalId] → one plan renamed across every version, one alias, customers on every version follow, attach by the old id lands on the active version
 *
 * a rename is a changed planId on a row that carries internalId; aliases per catalog-v2/plans/aliases
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

test.todo("rename all versions of another plan [v1 and v2 in planVersions, v3 in plans, every row renamed by its internalId] \u2192 one plan renamed across every version, one alias, customers on every version follow, attach by the old id lands on the active version", () => {});
