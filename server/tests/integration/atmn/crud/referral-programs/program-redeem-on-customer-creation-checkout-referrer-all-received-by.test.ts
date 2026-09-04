/**
 * atmn crud/referral programs — program [redeem_on: customer_creation, checkout, referrer, all] × [received_by: referrer, all]
 *
 * BLOCKED: no server piece in catalogV2.update yet. Leave as todo.
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

test.todo("program [redeem_on: customer_creation, checkout, referrer, all] \u00d7 [received_by: referrer, all]", () => {});
