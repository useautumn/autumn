import { measurersByBasis } from "./measurersByBasis.js";
import type {
	MeasureUsageAlertParams,
	UsageAlertMeasurer,
} from "./types/usageAlertMeasurer.js";

export const measureUsageAlert: UsageAlertMeasurer = (
	params: MeasureUsageAlertParams,
) => measurersByBasis[params.alert.basis ?? "balance"](params);
