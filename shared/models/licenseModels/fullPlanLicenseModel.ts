import { z } from "zod/v4";
import {
	type FullProductWithoutLicenses,
	FullProductWithoutLicensesSchema,
} from "../productModels/productModels";
import { type PlanLicense, PlanLicenseSchema } from "./licenseModels";

export type FullPlanLicense = PlanLicense & {
	product: FullProductWithoutLicenses;
};

export const FullPlanLicenseSchema: z.ZodType<FullPlanLicense> =
	PlanLicenseSchema.extend({
		// Defers module initialization only; the product shape cannot nest licenses.
		product: z.lazy(() => FullProductWithoutLicensesSchema),
	});
