import type { Readable, Transform } from "node:stream";
import {
	type BillingVerifyExportSpec,
	CustomerExportKind,
	type CustomerExportSpec,
	type CustomersExportSpec,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { createBillingVerifyExportStringifier } from "../../csv/createBillingVerifyExportStringifier.js";
import { createCustomerExportStringifier } from "../../csv/createCustomerExportStringifier.js";
import type { CustomerExportPopulation } from "../../queries/getCustomerExportScalars.js";
import type { CustomerExportProgressReporter } from "../customerExportProgressReporter.js";
import { createBillingVerifyExportRowStream } from "./createBillingVerifyExportRowStream.js";
import { createCustomerExportRowStream } from "./createCustomerExportRowStream.js";

export type CustomerExportRowStreamFactory<Spec extends CustomerExportSpec> =
	(args: {
		ctx: AutumnContext;
		snapshot: Spec["snapshot"];
		population: CustomerExportPopulation;
		progress?: CustomerExportProgressReporter;
		onPageProcessed: (page: {
			customerCount: number;
			rowCount: number;
		}) => Promise<void> | void;
	}) => Readable;

type CustomerExportProducer<Spec extends CustomerExportSpec> = {
	createRowStream: CustomerExportRowStreamFactory<Spec>;
	createStringifier: (args: { fields: Spec["fields"] }) => Transform;
};

export const CUSTOMER_EXPORT_PRODUCERS: {
	[CustomerExportKind.Customers]: CustomerExportProducer<CustomersExportSpec>;
	[CustomerExportKind.BillingVerify]: CustomerExportProducer<BillingVerifyExportSpec>;
} = {
	[CustomerExportKind.Customers]: {
		createRowStream: createCustomerExportRowStream,
		createStringifier: createCustomerExportStringifier,
	},
	[CustomerExportKind.BillingVerify]: {
		createRowStream: createBillingVerifyExportRowStream,
		createStringifier: createBillingVerifyExportStringifier,
	},
};

type CustomerExportStreamArgs = Omit<
	Parameters<CustomerExportRowStreamFactory<CustomerExportSpec>>[0],
	"snapshot"
>;

const toExportStreams = <Spec extends CustomerExportSpec>({
	producer,
	spec,
	streamArgs,
}: {
	producer: CustomerExportProducer<Spec>;
	spec: Spec;
	streamArgs: CustomerExportStreamArgs;
}) => ({
	rows: producer.createRowStream({ ...streamArgs, snapshot: spec.snapshot }),
	stringifier: producer.createStringifier({ fields: spec.fields }),
});

export const createExportStreams = ({
	spec,
	streamArgs,
}: {
	spec: CustomerExportSpec;
	streamArgs: CustomerExportStreamArgs;
}): { rows: Readable; stringifier: Transform } => {
	switch (spec.kind) {
		case CustomerExportKind.Customers:
			return toExportStreams({
				producer: CUSTOMER_EXPORT_PRODUCERS[spec.kind],
				spec,
				streamArgs,
			});
		case CustomerExportKind.BillingVerify:
			return toExportStreams({
				producer: CUSTOMER_EXPORT_PRODUCERS[spec.kind],
				spec,
				streamArgs,
			});
	}
};
