import type { Readable, Transform } from "node:stream";
import {
	type CustomerExportField,
	CustomerExportKind,
	type CustomerExportSnapshot,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { createBillingVerifyExportStringifier } from "../../csv/createBillingVerifyExportStringifier.js";
import { createCustomerExportStringifier } from "../../csv/createCustomerExportStringifier.js";
import type { CustomerExportPopulation } from "../../queries/getCustomerExportScalars.js";
import { createBillingVerifyExportRowStream } from "./createBillingVerifyExportRowStream.js";
import { createCustomerExportRowStream } from "./createCustomerExportRowStream.js";

export type CustomerExportRowStreamFactory = (args: {
	ctx: AutumnContext;
	snapshot: CustomerExportSnapshot;
	population: CustomerExportPopulation;
	totalCount: number;
	onPageProcessed: (page: {
		customerCount: number;
		rowCount: number;
	}) => Promise<void> | void;
}) => Readable;

type CustomerExportProducer = {
	createRowStream: CustomerExportRowStreamFactory;
	createStringifier: (args: { fields: CustomerExportField[] }) => Transform;
};

export const CUSTOMER_EXPORT_PRODUCERS: Record<
	CustomerExportKind,
	CustomerExportProducer
> = {
	[CustomerExportKind.Customers]: {
		createRowStream: createCustomerExportRowStream,
		createStringifier: createCustomerExportStringifier,
	},
	[CustomerExportKind.BillingVerify]: {
		createRowStream: createBillingVerifyExportRowStream,
		createStringifier: createBillingVerifyExportStringifier,
	},
};
