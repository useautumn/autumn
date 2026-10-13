import { Button, STATUS_TONES } from "@autumn/ui";
import { cn } from "@/lib/utils";
import { useLogsFilters } from "../../hooks/useLogsFilters";

export const LiveToggle = () => {
	const { filters, setFilters } = useLogsFilters();

	return (
		<Button
			variant="secondary"
			aria-pressed={filters.live}
			onClick={() => setFilters({ live: !filters.live })}
		>
			<span
				className={cn(
					"size-1.5 rounded-full",
					filters.live
						? cn(STATUS_TONES.green, "animate-pulse bg-current")
						: "bg-subtle",
				)}
			/>
			Live
		</Button>
	);
};
