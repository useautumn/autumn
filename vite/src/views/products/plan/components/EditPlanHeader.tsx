import { UserIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { toast } from "sonner";
import { AdminHover } from "@/components/general/AdminHover";
import { Badge } from "@/components/v2/badges/Badge";
import { IconBadge } from "@/components/v2/badges/IconBadge";
import V2Breadcrumb from "@/components/v2/breadcrumb";
import { Button } from "@/components/v2/buttons/Button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/v2/selects/Select";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";
import { isOneOffProduct } from "@/utils/product/priceUtils";
import { PlanTypeBadge } from "../../components/PlanTypeBadge";
import { useMigrationsQuery } from "../../product/hooks/queries/useMigrationsQuery.tsx.tsx";
import { useProductCountsQuery } from "../../product/hooks/queries/useProductCountsQuery";
import {
	useProductQuery,
	useProductQueryState,
} from "../../product/hooks/useProductQuery";
import { ConfirmMigrationDialog } from "./ConfirmMigrationDialog";

export const EditPlanHeader = () => {
	const { product, numVersions } = useProductQuery();
	const { counts } = useProductCountsQuery();
	const { refetch: refetchMigrations } = useMigrationsQuery();
	const { queryStates, setQueryStates } = useProductQueryState();
	const axiosInstance = useAxiosInstance();

	const [confirmMigrateOpen, setConfirmMigrateOpen] = useState(false);

	const versionOptions = Array.from(
		{ length: numVersions },
		(_, i) => numVersions - i,
	);
	const currentVersion = queryStates.version || product.version;

	const handleVersionChange = (version: string) => {
		const versionNumber = parseInt(version, 10);
		if (versionNumber === numVersions) {
			// Remove version param for latest version
			setQueryStates({ version: null });
		} else {
			setQueryStates({ version: versionNumber });
		}
	};

	const migrateCustomers = async () => {
		try {
			const { data } = await axiosInstance.post("/v1/migrations", {
				from_product_id: product.id,
				from_version: product.version,
				to_product_id: product.id,
				to_version: numVersions,
			});

			await refetchMigrations();

			toast.success(`Migration started. ID: ${data.id}`);
		} catch (error) {
			toast.error(getBackendErr(error, "Something went wrong with migration"));
		}
	};

	const getProductAdminHover = () => {
		return [
			{
				key: "internal_product_id",
				value: product.internal_id,
			},
			{
				key: "stripe_id",
				value: product.stripe_id || "N/A",
			},
			{
				key: "customer_product_id",
				value: product.cusProductId || "N/A",
			},
		];
	};

	// Determine if migration button should be shown
	const fromIsOneOff = isOneOffProduct(product.items);
	const migrateCount =
		(counts?.active || 0) - (counts?.canceled || 0) - (counts?.custom || 0);
	const version = product.version;

	const canMigrate =
		counts &&
		migrateCount > 0 &&
		!fromIsOneOff &&
		version &&
		version < numVersions;

	return (
		<>
			<ConfirmMigrationDialog
				open={confirmMigrateOpen}
				setOpen={setConfirmMigrateOpen}
				startMigration={migrateCustomers}
				version={version}
			/>
			<div className="flex flex-col gap-2 p-4 pb-3 w-full bg-card border-none shadow-none">
				<V2Breadcrumb
					className="p-0"
					items={[
						{
							name: "Plans",
							href: "/products?tab=products",
						},
						{
							name: `${product.name}`,
							href: `/products/${product.id}`,
						},
					]}
				/>
				<div className="col-span-2 flex">
					<div className="flex flex-row items-baseline justify-start gap-2 w-full whitespace-nowrap">
						<AdminHover texts={getProductAdminHover()}>
							<span className="text-lg font-medium w-fit whitespace-nowrap">
								{product.name}
							</span>
						</AdminHover>
						<span className="text-sm text-t3">v{product.version}</span>
					</div>
				</div>
				<div className="flex flex-row justify-between items-center">
					<div className="flex flex-row gap-2">
						{/* {badgeType && <Badge variant="muted">{badgeType}</Badge>} */}
						{product.is_default && <Badge variant="muted">Default</Badge>}
						{product.is_add_on && <Badge variant="muted">Add-on</Badge>}
						<IconBadge variant="muted" icon={<UserIcon />}>
							{counts?.active || 0}
						</IconBadge>
						<PlanTypeBadge product={product} />
					</div>

					<div className="flex flex-row gap-2 items-center">
						{canMigrate && (
							<Button
								variant="secondary"
								size="default"
								onClick={() => setConfirmMigrateOpen(true)}
							>
								Migrate customers
							</Button>
						)}

						{numVersions && numVersions > 1 && (
							<Select
								value={currentVersion.toString()}
								onValueChange={handleVersionChange}
							>
								<SelectTrigger className="w-fit min-w-28">
									<SelectValue placeholder="Version" />
								</SelectTrigger>
								<SelectContent>
									{versionOptions.map((version) => (
										<SelectItem key={version} value={version.toString()}>
											Version {version}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						)}
					</div>
				</div>
			</div>
		</>
	);
};
