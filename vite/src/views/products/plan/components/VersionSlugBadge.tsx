import { IconBadge, Tooltip, TooltipContent, TooltipTrigger } from "@autumn/ui";
import { StackIcon } from "@phosphor-icons/react";

export const VersionSlugBadge = ({ slug }: { slug: string }) => (
	<Tooltip>
		<TooltipTrigger className="shrink-0">
			<IconBadge variant="muted" icon={<StackIcon />}>
				<span className="max-w-30 text-tiny-id truncate">{slug}</span>
			</IconBadge>
		</TooltipTrigger>
		<TooltipContent>Version {slug}</TooltipContent>
	</Tooltip>
);
