/**
 * atmn crud/plans — paid [monthly] [item reset: year] [interval_count 1, 3]
 * Slice of one line of plans/atmn-v3/07_tests.md; the matrix lives in utils/itemResetIntervalMatrix.ts.
 */

import { runItemResetIntervalCases } from "./utils/itemResetIntervalMatrix.js";

runItemResetIntervalCases({ intervals: ["year"] });
