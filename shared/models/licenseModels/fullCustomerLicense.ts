import { z } from "zod/v4";
import type { DbCustomerLicense } from "./customerLicenseTable";
import type { FullPlanLicense } from "./fullPlanLicenseModel";

/** Customer license row hydrated with its effective plan license (customer
 * override when one exists, else the catalog link) and that license's
 * product. license is null when the link was removed — reconcile owns those. */
export type FullCustomerLicense = DbCustomerLicense & {
	license: FullPlanLicense | null;
};

/** Typed via z.custom: the row shape is drizzle-inferred (no zod source). */
export const FullCustomerLicenseSchema = z.custom<FullCustomerLicense>();
