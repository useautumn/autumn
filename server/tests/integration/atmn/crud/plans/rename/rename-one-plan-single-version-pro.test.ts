/**
 * atmn crud/plans/rename — rename one plan (single version) `pro → proNew` → same row, one alias `pro → proNew` (listAliases); real `billing.attach` with the old id lands on proNew, with the new id works; catalog get by the old id rewrites to proNew
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

test.todo("rename one plan (single version) `pro \u2192 proNew` \u2192 same row, one alias `pro \u2192 proNew` (listAliases); real `billing.attach` with the old id lands on proNew, with the new id works; catalog get by the old id rewrites to proNew", () => {});
