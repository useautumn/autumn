import { useNavigate } from "react-router";
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbList,
	BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { useEnv } from "@/utils/envUtils";
import { navigateTo } from "@/utils/genUtils";

interface BreadcrumbItemType {
	name: string;
	href: string;
}

export default function V2Breadcrumb({
	items,
}: {
	items: BreadcrumbItemType[];
}) {
	const env = useEnv();
	const navigate = useNavigate();

	return (
		<Breadcrumb className="text-t3 pt-6 pl-4 flex justify-center">
			<BreadcrumbList className="text-t3 text-xs w-full">
				{items.map((item, index) => (
					<>
						<BreadcrumbItem
							key={item.name}
							onClick={() => navigateTo(item.href, navigate, env)}
							className="cursor-pointer"
						>
							{item.name}
						</BreadcrumbItem>
						{index < items.length - 1 && <BreadcrumbSeparator />}
					</>
				))}
			</BreadcrumbList>
		</Breadcrumb>
	);
}
