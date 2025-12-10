import {
	CusProductStatus,
	type CustomerSchema,
	type FullCusProduct,
	isTrialing,
} from "@autumn/shared";
import type { ColumnDef, Row } from "@tanstack/react-table";
import type { z } from "zod/v4";
import { MiniCopyButton } from "@/components/v2/buttons/CopyButton";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/v2/tooltips/Tooltip";
import { formatUnixToDateTime } from "@/utils/formatUtils/formatDateUtils";
import { CustomerProductsStatus } from "../customer-products/CustomerProductsStatus";
import { CustomerListRowToolbar } from "./CustomerListRowToolbar";
import { FeatureUsageCell } from "./FeatureUsageCell";

type CustomerWithProducts = z.infer<typeof CustomerSchema> & {
	customer_products?: Array<{
		product?: { name?: string; id?: string; version?: number };
		status?: string;
		canceled_at?: number | null;
		trial_ends_at?: number | null;
		[key: string]: unknown;
	}>;
	/** Full customer products with entitlements - merged from full_customers query */
	fullCustomerProducts?: FullCusProduct[];
	/** Whether the full customer data is still loading */
	isFullDataLoading?: boolean;
};

/** Default column IDs that are visible by default */
export const BASE_COLUMN_IDS = [
	"name",
	"customer_id",
	"email",
	"customer_products",
	"created_at",
	"actions",
];

const getCusProductsInfo = ({
	customer,
}: {
	customer: CustomerWithProducts;
}) => {
	if (!customer.customer_products || customer.customer_products.length === 0) {
		return <span className="text-t3"></span>;
	}

	// Filter out expired and scheduled products first
	const activeProducts = customer.customer_products.filter(
		(cusProduct: (typeof customer.customer_products)[number]) =>
			(cusProduct as FullCusProduct).status !== CusProductStatus.Expired &&
			(cusProduct as FullCusProduct).status !== CusProductStatus.Scheduled,
	);

	//put add ons last THIS DOESNT WORK ATM BECAUSE NO ADD ON PARAM EXISTS
	activeProducts.sort((a, b) => {
		const aIsAddOn = (a as FullCusProduct).product.is_add_on;
		const bIsAddOn = (b as FullCusProduct).product.is_add_on;

		if (aIsAddOn !== bIsAddOn) {
			return aIsAddOn ? 1 : -1;
		}
		return 0;
	});

	// customer.id === "e526e698-6d5d-4f0e-89e7-632f375663fb" &&
	// 	console.log("activeProducts", activeProducts, "customer", customer);

	if (activeProducts.length === 0) {
		return <span className="text-t3">—</span>;
	}

	return (
		<div className="flex ">
			{activeProducts
				.slice(0, 1)
				.map((cusProduct: (typeof activeProducts)[number], index: number) => {
					return (
						<div key={index} className="flex items-center gap-2">
							{(cusProduct as FullCusProduct).product.name}
							<CustomerProductsStatus
								status={(cusProduct as FullCusProduct).status}
								canceled={
									(cusProduct as FullCusProduct).canceled_at ? true : undefined
								}
								tooltip={true}
								trialing={
									isTrialing({
										cusProduct: cusProduct as FullCusProduct,
										now: Date.now(),
									}) || false
								}
								trial_ends_at={
									(cusProduct as FullCusProduct).trial_ends_at ?? undefined
								}
							/>
							{activeProducts.length > 1 && (
								<TooltipProvider>
									<Tooltip delayDuration={0}>
										<TooltipTrigger>
											<span className="ml-1 bg-muted text-t3 px-1 py-0.5 rounded-md font-medium">
												+{activeProducts.length - 1}
											</span>
										</TooltipTrigger>
										<TooltipContent>
											{activeProducts
												.slice(1)
												.map(
													(p: (typeof activeProducts)[number]) =>
														(p as FullCusProduct).product.name,
												)
												.join(", ")}
										</TooltipContent>
									</Tooltip>
								</TooltipProvider>
							)}
						</div>
					);
				})}{" "}
		</div>
	);
};

export const createCustomerListColumns = (): ColumnDef<
	CustomerWithProducts,
	unknown
>[] => [
	{
		id: "name",
		header: "Name",
		accessorKey: "name",
		cell: ({ row }: { row: Row<CustomerWithProducts> }) => {
			return <div className="font-medium text-t1">{row.original.name}</div>;
		},
	},
	{
		id: "customer_id",
		header: "ID",
		accessorKey: "id",
		cell: ({ row }: { row: Row<CustomerWithProducts> }) => {
			const customer = row.original;
			return (
				<div className="font-mono justify-start flex w-full group">
					{customer.id ? (
						<MiniCopyButton text={customer.id} />
					) : (
						<span className="px-1 text-t3">NULL</span>
					)}
				</div>
			);
		},
	},
	{
		id: "email",
		header: "Email",
		accessorKey: "email",
		cell: ({ row }: { row: Row<CustomerWithProducts> }) => {
			return <div className="truncate">{row.original.email}</div>;
		},
	},
	{
		id: "customer_products",
		header: "Products",
		accessorKey: "customer_products",
		cell: ({ row }: { row: Row<CustomerWithProducts> }) => {
			return getCusProductsInfo({
				customer: row.original,
			});
		},
	},
	{
		id: "created_at",
		header: "Created At",
		accessorKey: "created_at",
		size: 80,
		cell: ({ row }: { row: Row<CustomerWithProducts> }) => {
			const { date, time } = formatUnixToDateTime(row.original.created_at);
			return (
				<div className="text-xs text-t4 pr-4 w-full">
					{date} <span className=" truncate">{time}</span>
				</div>
			);
		},
	},
	{
		id: "actions",
		header: "",
		accessorKey: "actions",
		size: 40,
		enableSorting: false,
		enableHiding: false,
		cell: ({ row }: { row: Row<CustomerWithProducts> }) => {
			return (
				<div
					className="flex justify-end w-full pr-2"
					onClick={(e) => e.stopPropagation()}
				>
					<CustomerListRowToolbar customer={row.original} />
				</div>
			);
		},
	},
];

/**
 * Creates a usage column for a specific metered feature
 */
export const createUsageColumn = ({
	featureId,
	featureName,
}: {
	featureId: string;
	featureName: string;
}): ColumnDef<CustomerWithProducts, unknown> => ({
	id: `usage_${featureId}`,
	header: featureName,
	size: 120,
	cell: ({ row }: { row: Row<CustomerWithProducts> }) => {
		const customer = row.original;
		return (
			<FeatureUsageCell
				customerProducts={customer.fullCustomerProducts}
				featureId={featureId}
				isLoading={customer.isFullDataLoading}
			/>
		);
	},
});

export type { CustomerWithProducts };
