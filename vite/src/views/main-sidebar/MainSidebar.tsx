import {
	BalloonIcon,
	BasketIcon,
	ChartBarIcon,
	CoinVerticalIcon,
	CubeIcon,
	LegoIcon,
	OptionIcon,
	TerminalWindowIcon,
	TriangleIcon,
	UserCircleIcon,
	WebhooksLogoIcon,
} from "@phosphor-icons/react";
import { PanelLeft } from "lucide-react";
import { useHotkeys } from "react-hotkeys-hook";
import { Button } from "@/components/ui/button";
import { useAutumnFlags } from "@/hooks/common/useAutumnFlags";
import { useLocalStorage } from "@/hooks/common/useLocalStorage";
import { useOrg } from "@/hooks/common/useOrg";
import { cn } from "@/lib/utils";
import { useEnv } from "@/utils/envUtils";
import { CollapsibleNavGroup } from "./CollapsibleNavGroup";
import { DeployToProdButton } from "./components/deploy-button/DeployToProdButton";
import { OrgDropdown } from "./components/OrgDropdown";
import { EnvDropdown } from "./EnvDropdown";
import { NavButton } from "./NavButton";
import SidebarBottom from "./SidebarBottom";
import { SidebarContext } from "./SidebarContext";

export const buildDevSubTabs = ({
	flags,
}: {
	flags: {
		webhooks: boolean;
		vercel: boolean;
	};
}) => {
	return [
		{
			title: "API Keys",
			value: "api_keys",
			icon: <OptionIcon size={16} />,
		},
		{
			title: "Stripe",
			value: "stripe",
			icon: <CoinVerticalIcon size={16} weight="fill" />,
		},
		...(flags.vercel
			? [
					{
						title: "Vercel",
						value: "vercel",
						icon: <TriangleIcon size={16} weight="fill" />,
					},
				]
			: []),
		...(flags.webhooks
			? [
					{
						title: "Webhooks",
						value: "webhooks",
						icon: <WebhooksLogoIcon size={16} weight="fill" />,
					},
				]
			: []),
	];
};

export const MainSidebar = () => {
	const env = useEnv();
	const { org } = useOrg();

	const flags = useAutumnFlags();
	console.log();

	const [expanded, setExpanded] = useLocalStorage<boolean>(
		"sidebar.expanded",
		true,
	);

	const [productGroupOpen, setProductGroupOpen] = useLocalStorage<boolean>(
		"sidebar.productGroupOpen",
		true,
	);
	const [devGroupOpen, setDevGroupOpen] = useLocalStorage<boolean>(
		"sidebar.devGroupOpen",
		true,
	);

	useHotkeys(["meta+b", "ctrl+b"], () => {
		setExpanded((prev) => !prev);
	});

	const onProductTabClick = () => {
		setProductGroupOpen((prev) => !prev);
	};

	// const expanded = state == "expanded";
	return (
		<SidebarContext.Provider value={{ expanded, setExpanded }}>
			<div
				className={cn(
					`h-full py-4 flex flex-col justify-between transition-all duration-150`,
					expanded
						? "min-w-[200px] max-w-[200px]"
						: "min-w-[50px] max-w-[50px]",
				)}
			>
				<div className="flex flex-col gap-6 relative">
					<Button
						variant="outline"
						size="sm"
						onClick={() => {
							setExpanded((prev) => !prev);
						}}
						className={cn(
							"absolute top-1 right-4 text-t3 hover:bg-stone-200 w-5 h-5 p-0 border-none border-0 shadow-none !bg-transparent",
							expanded
								? "opacity-100 transition-opacity duration-100"
								: "opacity-0 transition-opacity duration-100",
						)}
					>
						<PanelLeft size={14} />
					</Button>
					<OrgDropdown />
					{org?.deployed ? (
						<EnvDropdown env={env} />
					) : (
						<DeployToProdButton expanded={expanded} />
					)}
					<div className="flex flex-col px-2 gap-1">
						<CollapsibleNavGroup
							value="products"
							icon={<BasketIcon size={16} weight="fill" />}
							title="Products"
							env={env}
							isOpen={productGroupOpen}
							onToggle={onProductTabClick}
							subTabs={[
								{
									title: "Plans",
									value: "products",
									icon: <CubeIcon size={16} weight="fill" />,
								},
								{
									title: "Features",
									value: "features",
									icon: <LegoIcon size={16} weight="fill" />,
								},
								{
									title: "Rewards",
									value: "rewards",
									icon: <BalloonIcon size={16} weight="fill" />,
								},
							]}
						/>
						<NavButton
							value="customers"
							icon={<UserCircleIcon size={16} weight="fill" />}
							title="Customers"
							env={env}
						/>
						<NavButton
							value="analytics"
							icon={<ChartBarIcon size={16} weight="fill" />}
							title="Analytics"
							env={env}
						/>
						<CollapsibleNavGroup
							value="dev"
							icon={<TerminalWindowIcon size={16} weight="fill" />}
							title="Developer"
							env={env}
							isOpen={devGroupOpen}
							onToggle={() => setDevGroupOpen((prev) => !prev)}
							subTabs={buildDevSubTabs({ flags })}
						/>
					</div>
				</div>

				<SidebarBottom />
			</div>
		</SidebarContext.Provider>
	);
};
