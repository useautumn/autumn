import { buttonVariants } from "@autumn/ui";
import { ArrowRightIcon } from "@phosphor-icons/react";
import { Link } from "react-router";
import { cn } from "@/lib/utils";
import { pushPage } from "@/utils/genUtils";

export function VariantPlanLink({
	planId,
	version,
	name,
}: {
	planId: string;
	version: number;
	name: string;
}) {
	const href = pushPage({
		path: `/products/${planId}`,
		queryParams: { version: String(version) },
		preserveParams: false,
	});

	return (
		<Link
			aria-label={`Go to ${name}`}
			className={cn(
				buttonVariants({ variant: "secondary", size: "mini" }),
				"!h-6 w-6",
			)}
			to={href}
		>
			<ArrowRightIcon />
		</Link>
	);
}
