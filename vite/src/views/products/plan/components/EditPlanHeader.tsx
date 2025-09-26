import { UserIcon } from "@phosphor-icons/react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AdminHover } from "@/components/general/AdminHover";
import { Badge } from "@/components/v2/badges/Badge";
import { IconBadge } from "@/components/v2/badges/IconBadge";
import V2Breadcrumb from "@/components/v2/breadcrumb";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/v2/selects/Select";
import { PlanTypeBadge } from "../../components/PlanTypeBadge";
import { useProductCountsQuery } from "../../product/hooks/queries/useProductCountsQuery";
import { useProductQuery } from "../../product/hooks/useProductQuery";

export const EditPlanHeader = () => {
	const { product, numVersions } = useProductQuery();
	const { counts } = useProductCountsQuery();
	const navigate = useNavigate();
	const [searchParams] = useSearchParams();

	// Early return if product is not loaded yet
	if (!product || !numVersions) {
		return null;
	}

	const badgeType =
		product.is_default &&
		product.free_trial &&
		!product.free_trial.card_required
			? "Default Trial"
			: product.is_default
				? "Default"
				: product.is_add_on
					? "Add-on"
					: "";

	const versionOptions = Array.from(
		{ length: numVersions },
		(_, i) => numVersions - i,
	);
	const versionParam = searchParams.get("version");
	const currentVersion =
		versionParam !== null ? parseInt(versionParam, 10) : product.version;

	const handleVersionChange = (version: string) => {
		const newSearchParams = new URLSearchParams(searchParams);
		if (version === numVersions.toString()) {
			newSearchParams.delete("version");
		} else {
			newSearchParams.set("version", version);
		}
		navigate({ search: newSearchParams.toString() });
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

	return (
		<div className="flex flex-col gap-2 p-4 pb-3 w-full bg-card">
			<V2Breadcrumb
				className="p-0"
				items={[
					{
						name: "Plans",
						href: "/products",
					},
					{
						name: "Plan Editor",
						href: `/products`,
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

				<Select
					value={currentVersion.toString()}
					onValueChange={handleVersionChange}
				>
					<SelectTrigger className="w-20">
						<SelectValue placeholder="Version" />
					</SelectTrigger>
					<SelectContent>
						{versionOptions.map((version) => (
							<SelectItem key={version} value={version.toString()}>
								v{version}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>
		</div>
	);
};
