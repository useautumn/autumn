import {
	ACTIVE_STATUSES,
	AffectedResource,
	type APICusProduct,
	APICustomerSchema,
	type ApiVersion,
	ApiVersionClass,
	applyResponseVersionChanges,
	type CusProductStatus,
	type Feature,
	type FullCusProduct,
	type FullCustomer,
	LATEST_VERSION,
} from "@autumn/shared";
import { getApiCusFeature } from "./getApiCusFeature.js";
import { getApiCusProduct } from "./getApiCusProduct.js";

/**
 * Merges customer products by id and status
 * This is how V1_1+ handles multiple subscriptions to the same product
 */
const mergeApiCusProducts = ({
	cusProductResponses,
}: {
	cusProductResponses: APICusProduct[];
}) => {
	const getProductKey = (product: APICusProduct) => {
		const status = ACTIVE_STATUSES.includes(product.status as CusProductStatus)
			? "active"
			: product.status;
		return `${product.id}:${status}`;
	};

	const record: Record<string, any> = {};

	for (const curr of cusProductResponses) {
		const key = getProductKey(curr);
		const latest = record[key];

		const currStartedAt = curr.started_at;

		record[key] = {
			...(latest || curr),
			version: Math.max(latest?.version || 1, curr?.version || 1),
			canceled_at: curr.canceled_at
				? curr.canceled_at
				: latest?.canceled_at || null,
			started_at: latest?.started_at
				? Math.min(latest?.started_at, currStartedAt)
				: currStartedAt,
			quantity: (latest?.quantity || 0) + (curr?.quantity || 0),
		};
	}

	return Object.values(record);
};

export const getApiCustomer = async ({
	customer,
	cusProducts,
	balances,
	features,
	apiVersion,
	invoices,
	trialsUsed,
	rewards,
	entities,
	referrals,
	upcomingInvoice,
	paymentMethod,
	withAutumnId = false,
}: {
	customer: FullCustomer;
	cusProducts: FullCusProduct[];
	balances: any[];
	features: Feature[];
	apiVersion: ApiVersion;
	invoices?: any[];
	trialsUsed?: any[];
	rewards?: any;
	entities?: any[];
	referrals?: any[];
	upcomingInvoice?: any;
	paymentMethod?: any;
	withAutumnId?: boolean;
}): Promise<any> => {
	const subs = customer.subscriptions || [];

	// Process each product using getApiCusProduct (builds latest format + applies transforms)
	let main: APICusProduct[] = [];
	let addOns: APICusProduct[] = [];

	for (const cusProduct of cusProducts) {
		const processed = await getApiCusProduct({
			cusProduct,
			subs,
			features,
			apiVersion,
		});

		const isAddOn = cusProduct.product.is_add_on;
		if (isAddOn) {
			addOns.push(processed);
		} else {
			main.push(processed);
		}
	}

	// Merge products (V1_1+ behavior, always do this in latest format)
	main = mergeApiCusProducts({ cusProductResponses: main });
	addOns = mergeApiCusProducts({ cusProductResponses: addOns });

	// Merge main and addOns into single products array (V1_1+ behavior)
	const allProducts = [...main, ...addOns];

	// Get versioned features (handles field mapping + object vs array format)
	const apiFeatures = getApiCusFeature({
		balances,
		features,
		apiVersion,
	});

	// Build customer in latest format (V1_1+: merged response with features/products)
	const latestCustomer = APICustomerSchema.parse({
		autumn_id: withAutumnId ? customer.internal_id : undefined,
		id: customer.id,
		email: customer.email,
		name: customer.name,
		fingerprint: customer.fingerprint,
		stripe_id: customer.processor?.id,
		env: customer.env,
		created_at: customer.created_at,
		features: apiFeatures, // Already versioned (object for V1_2, array for V1_1)
		products: allProducts, // Merged products (V1_1+ format)
		invoices,
		trials_used: trialsUsed,
		rewards,
		metadata: customer.metadata || {},
		entities,
		referrals,
		upcoming_invoice: upcomingInvoice,
		payment_method: paymentMethod,
	});

	// Apply customer-level version changes (e.g., V1_1_MergedResponse)
	// This will split the merged response for V1_0 users
	return applyResponseVersionChanges({
		input: latestCustomer,
		currentVersion: new ApiVersionClass(LATEST_VERSION),
		targetVersion: new ApiVersionClass(apiVersion),
		resource: AffectedResource.Customer,
	});
};
