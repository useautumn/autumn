import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { DEFAULT_PHOSPHOR_ICON, loadPhosphorIcon } from "./phosphorIcons";

export function PhosphorIcon({
	name,
	className,
}: {
	name?: string;
	className?: string;
}) {
	const resolvedName = name ?? DEFAULT_PHOSPHOR_ICON;
	const { data: Icon } = useQuery({
		queryKey: ["phosphor-icon", resolvedName],
		queryFn: () => loadPhosphorIcon(resolvedName),
		staleTime: Number.POSITIVE_INFINITY,
		gcTime: Number.POSITIVE_INFINITY,
	});

	if (!Icon) {
		return (
			<span aria-hidden="true" className={cn("inline-block", className)} />
		);
	}
	return <Icon className={className} />;
}
