import { type AppEnv, ProcessorType } from "@autumn/shared";
import type Stripe from "stripe";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import type { AutumnInt } from "@/external/autumn/autumnCli.js";
import { attachPmToCus } from "@/external/stripe/stripeCusUtils.js";
import { handleAddProduct } from "@/internal/customers/attach/attachFunctions/addProductFlow/handleAddProduct.js";
import { newCusToAttachParams } from "@/internal/customers/attach/attachUtils/attachParams/convertToParams.js";
import { CusService } from "@/internal/customers/CusService.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { isDefaultTrialFullProduct } from "@/internal/products/productUtils/classifyProduct.js";
import { generateId } from "@/utils/genUtils.js";

export async function manuallyAttachDefaultTrial({
	customerId,
	stripeCli,
	autumn,
	db,
	org,
	env,
	testClockID,
	autumnJs,
	attachPm = "",
	group,
}: {
	customerId: string;
	stripeCli: Stripe;
	autumn: AutumnInt;
	db: DrizzleCli;
	org: any;
	env: AppEnv;
	testClockID?: string;
	autumnJs: any;
	attachPm?: "success" | "fail" | "";
	group?: string;
}) {
	try {
		const existingCustomer = await CusService.get({
			db,
			idOrInternalId: customerId,
			orgId: org.id,
			env,
		});
		if (existingCustomer) {
			// Delete via API to clean up properly
			await autumnJs.customers.delete(customerId);
		}
	} catch (error) {
		// Ignore if customer doesn't exist
		console.log("Customer doesn't exist, skipping delete", error);
	}

	// Step 2: Manually create customer in DB (following createNewCustomer.ts logic)
	const customerData = {
		id: customerId,
		name: customerId,
		email: `${customerId}@example.com`,
		metadata: {},
		internal_id: generateId("cus"),
		org_id: org.id,
		created_at: Date.now(),
		env,
	};

	const newCustomer = await CusService.insert({
		db,
		data: customerData,
	});

	if (!newCustomer) {
		throw new Error("Failed to create customer");
	}

	// Step 3: Get default products (following createNewCustomer.ts logic)
	const allDefaultProds = await ProductService.listDefault({
		db,
		orgId: org.id,
		env,
	});

	// Filter by group if specified
	const defaultProds = group
		? allDefaultProds.filter((p) => p.group === group)
		: allDefaultProds;

	const defaultPaidTrialProd = defaultProds.find((p) =>
		isDefaultTrialFullProduct({ product: p }),
	);

	let customer = newCustomer;

	if (defaultPaidTrialProd) {
		// Step 4: Create Stripe customer with test clock
		const stripeCustomer = await stripeCli.customers.create({
			email: `${customerId}@example.com`,
			test_clock: testClockID ? testClockID : undefined,
		});

		// Step 5: Update customer with Stripe processor info (BEFORE attachPmToCus)
		await CusService.update({
			db,
			internalCusId: newCustomer.internal_id,
			update: {
				processor: {
					type: ProcessorType.Stripe,
					id: stripeCustomer.id,
				},
			},
		});

		// Update local customer object
		customer = {
			...newCustomer,
			processor: {
				id: stripeCustomer.id,
				type: "stripe",
			},
		} as any;

		if (attachPm && testClockID) {
			await attachPmToCus({
				customer: customer,
				org: org,
				env: env,
				db: db,
				testClockId: testClockID,
				willFail: attachPm === "fail",
			});
		}

		// Step 6: Manually attach the default trial product (following createNewCustomer.ts logic)
		const req = {
			db,
			org,
			env,
			orgId: org.id,
			logger: console,
		} as any;

		await handleAddProduct({
			req,
			attachParams: newCusToAttachParams({
				req,
				newCus: customer as any,
				products: [defaultPaidTrialProd],
				stripeCli,
				freeTrial: defaultPaidTrialProd.free_trial || null,
			}),
		});

		return customer;
	}
}

export async function cleanupQueueAndCache() {
	try {
		const { QueueManager } = await import("@/queue/QueueManager.js");
		const queueInstance = await QueueManager.getInstance();

		// Access private properties to close connections
		if ((queueInstance as any).queue) {
			await (queueInstance as any).queue.close();
		}
		if ((queueInstance as any).backupQueue) {
			await (queueInstance as any).backupQueue.close();
		}
		if ((queueInstance as any).mainConnection) {
			await (queueInstance as any).mainConnection.quit();
		}
		if ((queueInstance as any).backupConnection) {
			await (queueInstance as any).backupConnection.quit();
		}
	} catch (error) {
		// Ignore cleanup errors
	}

	try {
		const { CacheManager } = await import("@/utils/cacheUtils/CacheManager.js");
		const cacheInstance = await CacheManager.getInstance();
		if ((cacheInstance as any).connection) {
			await (cacheInstance as any).connection.quit();
		}
	} catch (error) {
		// Ignore cleanup errors
	}
}

export async function flipDefaultState({
	id,
	autumn,
	state,
}: {
	id: string;
	autumn: AutumnInt;
	state: boolean;
}) {
	try {
		const productExists = await autumn.products.get(id);
		if (productExists) {
			await autumn.products.update(id, {
				is_default: state,
			});
		}
	} catch (error) {
		console.log(`Product ${id} doesn't exist, skipping update`);
	}
}

export async function flipDefaultStates({
	currentCase,
	autumn,
}: {
	currentCase: number;
	autumn: AutumnInt;
}) {
	const total = 4;

	// Now flip all products from 0 to total-1, only current case should be true
	for (let i = 0; i < total; i++) {
		const id = `defaultTrial${i}_pro`;
		const state = i === currentCase; // Only the current case is true
		await flipDefaultState({
			id,
			autumn,
			state,
		});
	}

	for (let i = 0; i < total; i++) {
		const id = `defaultTrial${i}_free`;
		const state = i === currentCase; // Only the current case is true
		await flipDefaultState({
			id,
			autumn,
			state,
		});
	}
}
