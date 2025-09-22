import { generateId } from "@/utils/genUtils.js";
import {
	AppEnv,
	MigrationError,
	MigrationJob,
	MigrationJobStep,
	Product,
} from "@autumn/shared";

export const constructMigrationError = ({
	migrationJobId,
	internalCustomerId,
	data,
	code,
	message,
}: {
	migrationJobId: string;
	internalCustomerId: string;
	data: any;
	code: string;
	message: string;
}) => {
	let migrationError: MigrationError = {
		migration_job_id: migrationJobId,
		internal_customer_id: internalCustomerId,
		data,
		code,
		message,
		created_at: Date.now(),
		updated_at: Date.now(),
	};

	return migrationError;
};

export const constructMigrationJob = ({
	fromProduct,
	toProduct,
}: {
	fromProduct: Product;
	toProduct: Product;
}) => {
	let migrationJob: MigrationJob = {
		id: generateId("mig_job"),
		created_at: Date.now(),
		updated_at: Date.now(),

		from_internal_product_id: fromProduct.internal_id,
		to_internal_product_id: toProduct.internal_id,
		current_step: MigrationJobStep.Queued,
		step_details: {},

		org_id: fromProduct.org_id,
		env: fromProduct.env as AppEnv,
	};

	return migrationJob;
};
