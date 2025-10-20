import {
	ChartColumnBig,
	CircleUserRound,
	Package,
	PanelLeft,
	SquareTerminal,
} from "lucide-react";
import { useHotkeys } from "react-hotkeys-hook";
import { Button } from "@/components/ui/button";
import { useAutumnFlags } from "@/hooks/common/useAutumnFlags";
import { useLocalStorage } from "@/hooks/common/useLocalStorage";
import { useOrg } from "@/hooks/common/useOrg";
import { cn } from "@/lib/utils";
import { useEnv } from "@/utils/envUtils";
import { DeployToProdButton } from "./components/deploy-button/DeployToProdButton";
import { OrgDropdown } from "./components/OrgDropdown";
import { EnvDropdown } from "./EnvDropdown";
import { NavButton } from "./NavButton";
import SidebarBottom from "./SidebarBottom";
import { SidebarContext } from "./SidebarContext";
import { SidebarGroup } from "./SidebarGroup";

export const MainSidebar = () => {
	const env = useEnv();
	const { org } = useOrg();

	const { webhooks } = useAutumnFlags();

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
					`h-full bg-stone-100 py-4 flex flex-col justify-between transition-all duration-150`,
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
							"absolute top-1 right-4 text-t3 hover:bg-stone-200 w-5 h-5 p-0 border-none border-0 shadow-none bg-transparent",
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
						<div>
							<NavButton
								value="products"
								onClick={onProductTabClick}
								icon={<Package size={14} />}
								title="Plans"
								env={env}
								isOpen={expanded ? productGroupOpen : undefined}
								isGroup
							/>
							<SidebarGroup
								value="products"
								productGroup={productGroupOpen}
								subTabs={[
									{ title: "Plans", value: "products" },
									{ title: "Features", value: "features" },
									{ title: "Rewards", value: "rewards" },
								]}
							/>
						</div>

						<NavButton
							value="customers"
							icon={<CircleUserRound size={14} />}
							title="Customers"
							env={env}
						/>
						<NavButton
							value="analytics"
							icon={<ChartColumnBig size={14} />}
							title="Analytics"
							env={env}
						/>
						<div>
							<NavButton
								value="dev"
								icon={<SquareTerminal size={14} />}
								title="Developer"
								env={env}
								onClick={() => setDevGroupOpen((prev) => !prev)}
								isOpen={expanded ? devGroupOpen : undefined}
								isGroup
							/>
							<SidebarGroup
								value="dev"
								productGroup={devGroupOpen}
								subTabs={
									webhooks
										? [
												{ title: "API Keys", value: "api_keys" },
												{ title: "Stripe", value: "stripe" },
												{ title: "Webhooks", value: "webhooks" },
											]
										: [
												{ title: "API Keys", value: "api_keys" },
												{ title: "Stripe", value: "stripe" },
											]
								}
							/>
						</div>
						{/* <div className="flex flex-col my-1 gap-0.5 border-l border-zinc-300 ml-4 -translate-x-[1px] pl-0">
            <NavButton
              value="api keys"
              icon={<KeyRound size={14} className="text-t2/75" />}
              title="API Keys"
              env={env}
              className="text-t2/90"
            />
            <NavButton
              value="stripe"
              icon={<Workflow size={14} className="text-t2/75" />}
              title="Connect Stripe"
              env={env}
              className="text-t2/90"
            />
          </div> */}
					</div>
				</div>

				<SidebarBottom />
			</div>
		</SidebarContext.Provider>
	);
};
