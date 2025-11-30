import {
	CusProductStatus,
	type CustomerSchema,
	type FullCusProduct,
	isTrialing,
} from "@autumn/shared";
import type { Row } from "@tanstack/react-table";
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

type CustomerWithProducts = z.infer<typeof CustomerSchema> & {
	customer_products?: Array<{
		product?: { name?: string; id?: string; version?: number };
		status?: string;
		canceled_at?: number | null;
		trial_ends_at?: number | null;
		[key: string]: unknown;
	}>;
};

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

	//put add ons last
	activeProducts.sort((a, b) => {
		const aIsAddOn = (a as FullCusProduct).product.is_add_on;
		const bIsAddOn = (b as FullCusProduct).product.is_add_on;

		if (aIsAddOn !== bIsAddOn) {
			return aIsAddOn ? 1 : -1;
		}
		return 0;
	});

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

export const createCustomerListColumns = () => [
	{
		header: "Name",
		accessorKey: "name",
		cell: ({ row }: { row: Row<CustomerWithProducts> }) => {
			return <div className="font-medium text-t1">{row.original.name}</div>;
		},
	},
	{
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
		header: "Email",
		accessorKey: "email",
		cell: ({ row }: { row: Row<CustomerWithProducts> }) => {
			return <div className="truncate">{row.original.email}</div>;
		},
	},
	{
		header: "Products",
		accessorKey: "customer_products",
		cell: ({ row }: { row: Row<CustomerWithProducts> }) => {
			return getCusProductsInfo({
				customer: row.original,
			});
		},
	},
	{
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
		header: "",
		accessorKey: "actions",
		size: 40,
		enableSorting: false,
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

export type { CustomerWithProducts };
