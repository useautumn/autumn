import { cn } from "@autumn/ui/lib/utils";
import { formatDistanceToNowStrict } from "date-fns";
import type { RolloutPercent } from "./rolloutTypes";
import { useNow } from "./useNow";

const Dot = ({ pending }: { pending: boolean }) => (
	<span className="relative flex size-2">
		{pending && (
			<span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-yellow-500/60 opacity-75" />
		)}
		<span
			className={cn(
				"relative inline-flex size-2 rounded-full",
				pending ? "bg-yellow-500" : "bg-green-500",
			)}
		/>
	</span>
);

/** Where the last percent change stands: never set, landing in N seconds, or live since. */
export const RolloutFlipStatus = ({
	rollout,
	settleMs,
	className,
}: {
	rollout: RolloutPercent;
	settleMs: number;
	className?: string;
}) => {
	const effectiveAt = rollout.changedAt + settleMs;
	const now = useNow({
		active: rollout.changedAt > 0 && Date.now() < effectiveAt,
	});

	if (!rollout.changedAt) {
		return (
			<span className={cn("text-tiny text-subtle", className)}>
				Never changed
			</span>
		);
	}

	const secondsLeft = Math.ceil((effectiveAt - now) / 1_000);
	const pending = secondsLeft > 0;

	return (
		<span
			className={cn(
				"flex shrink-0 items-center gap-2 text-tiny tabular-nums text-subtle",
				className,
			)}
		>
			{pending
				? `${rollout.previousPercent}% → ${rollout.percent}% in ${secondsLeft}s`
				: `Live ${formatDistanceToNowStrict(effectiveAt, { addSuffix: true })}`}
			<Dot pending={pending} />
		</span>
	);
};
