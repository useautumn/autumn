import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbList,
	BreadcrumbSeparator,
} from "@autumn/ui";
import React from "react";
import { useNavigate } from "react-router";
import { cn } from "@/lib/utils";
import { useEnv } from "@/utils/envUtils";
import { navigateTo } from "@/utils/genUtils";

interface BreadcrumbItemType {
	name: string;
	href?: string;
}

export default function V2Breadcrumb({
	items,
	className,
}: {
	items: BreadcrumbItemType[];
	className?: string;
}) {
	const env = useEnv();
	const navigate = useNavigate();

	return (
		<Breadcrumb
			className={cn(
				"text-tertiary-foreground pt-6 pl-4 flex justify-center",
				className,
			)}
		>
			<BreadcrumbList className="text-tertiary-foreground text-xs w-full">
				{items.map((item, index) => (
					<React.Fragment key={index}>
						<BreadcrumbItem
							key={item.name}
							onClick={() => item.href && navigateTo(item.href, navigate, env)}
							className="cursor-pointer"
						>
							<span>{item.name}</span>
						</BreadcrumbItem>
						{index < items.length - 1 && <BreadcrumbSeparator />}
					</React.Fragment>
				))}
			</BreadcrumbList>
		</Breadcrumb>
	);
}
