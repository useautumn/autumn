import React from "react";
import { useNavigate } from "react-router";
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbList,
	BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
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
			className={cn("text-t3 pt-6 pl-4 flex justify-center", className)}
		>
			<BreadcrumbList className="text-t3 text-xs w-full">
				{items.map((item, index) => (
					<React.Fragment key={index}>
						<BreadcrumbItem
							key={item.name}
							onClick={() => item.href && navigateTo(item.href, navigate, env)}
							className="cursor-pointer"
						>
							<span className="truncate max-w-36">{item.name}</span>
						</BreadcrumbItem>
						{index < items.length - 1 && <BreadcrumbSeparator />}
					</React.Fragment>
				))}
			</BreadcrumbList>
		</Breadcrumb>
	);
}
