import {
	AlertTriangle,
	Ban,
	Bot,
	Check,
	CircleAlert,
	Clock,
	Flame,
	Hourglass,
	LoaderCircle,
	type LucideIcon,
	Minus,
	UserRound,
	X,
} from "lucide-react";
import type { ReactNode } from "react";
import type { z } from "zod";
import type {
	ActorRef,
	FileResultStatus,
	RunStatus,
} from "../../../src/api/contract.ts";
import { ApiRequestError } from "../api/client.ts";
import { cn, handle, isAgentVia } from "../lib/format.ts";
import { Tooltip } from "./ui.tsx";

export type Tone = "ok" | "bad" | "warn" | "amber" | "info" | "idle";

export const TONE_TEXT: Record<Tone, string> = {
	ok: "text-green-600 dark:text-green-500",
	bad: "text-red-600 dark:text-red-400",
	warn: "text-orange-600 dark:text-orange-400",
	amber: "text-amber-600 dark:text-amber-400",
	info: "text-blue-600 dark:text-blue-400",
	idle: "text-subtle",
};
export const TONE_BG: Record<Tone, string> = {
	ok: "bg-green-500",
	bad: "bg-red-500",
	warn: "bg-orange-400",
	amber: "bg-amber-500",
	info: "bg-blue-500",
	idle: "bg-subtle/60",
};

const RUN_STATUS: Record<
	z.infer<typeof RunStatus>,
	{ tone: Tone; icon: LucideIcon }
> = {
	queued: { tone: "idle", icon: Hourglass },
	warming: { tone: "warn", icon: Flame },
	provisioning: { tone: "info", icon: LoaderCircle },
	running: { tone: "info", icon: LoaderCircle },
	tearing_down: { tone: "info", icon: LoaderCircle },
	passed: { tone: "ok", icon: Check },
	failed: { tone: "bad", icon: X },
	cancelled: { tone: "idle", icon: Ban },
	errored: { tone: "bad", icon: AlertTriangle },
};
const FILE_STATUS: Record<
	z.infer<typeof FileResultStatus>,
	{ tone: Tone; icon: LucideIcon }
> = {
	queued: { tone: "idle", icon: Hourglass },
	running: { tone: "info", icon: LoaderCircle },
	passed: { tone: "ok", icon: Check },
	failed: { tone: "bad", icon: X },
	crashed: { tone: "bad", icon: AlertTriangle },
	timed_out: { tone: "amber", icon: Clock },
	skipped: { tone: "idle", icon: Minus },
};

export const StatusDot = ({ tone, pulse }: { tone: Tone; pulse?: boolean }) => (
	<span
		aria-hidden
		className={cn(
			"inline-block size-1.5 shrink-0 rounded-full",
			TONE_BG[tone],
			pulse && "twd-pulse",
		)}
	/>
);

const label = (s: string) => s.replace(/_/g, " ");

/** Autumn's plan status chip: bordered, tone-coloured icon + label. */
export const RunStatusBadge = ({
	status,
}: {
	status: z.infer<typeof RunStatus>;
}) => {
	const { tone, icon: Icon } = RUN_STATUS[status];
	return (
		<span
			className={cn(
				"inline-flex h-[22px] shrink-0 items-center gap-1 rounded-[5px] border bg-background px-1.5 text-xs font-medium capitalize",
				TONE_TEXT[tone],
			)}
		>
			<Icon
				className={cn("size-3", Icon === LoaderCircle && "animate-spin")}
				strokeWidth={2.25}
			/>
			{label(status)}
		</span>
	);
};

export const FileStatusBadge = ({
	status,
}: {
	status: z.infer<typeof FileResultStatus>;
}) => {
	const { tone, icon: Icon } = FILE_STATUS[status];
	return (
		<span
			className={cn(
				"inline-flex items-center gap-1 text-xs font-medium whitespace-nowrap capitalize",
				TONE_TEXT[tone],
			)}
		>
			<Icon
				className={cn("size-3", Icon === LoaderCircle && "animate-spin")}
				strokeWidth={2.25}
			/>
			{label(status)}
		</span>
	);
};

export const Pill = ({
	tone = "idle",
	children,
	className,
}: {
	tone?: Tone;
	children: ReactNode;
	className?: string;
}) => (
	<span
		className={cn(
			"inline-flex h-5 items-center gap-1 rounded-md bg-muted px-1.5 text-[11px] font-medium whitespace-nowrap",
			tone === "idle" ? "text-tertiary-foreground" : TONE_TEXT[tone],
			className,
		)}
	>
		{children}
	</span>
);

/** Segmented bar: passed · failed · running over total. */
export const RunProgress = ({
	passed,
	failed,
	total,
	running = 0,
	className,
}: {
	passed: number;
	failed: number;
	total: number | null;
	running?: number;
	className?: string;
}) => {
	const t = Math.max(total ?? 0, passed + failed + running, 1);
	const pct = (n: number) => `${(n / t) * 100}%`;
	return (
		<div
			role="progressbar"
			aria-valuemin={0}
			aria-valuemax={t}
			aria-valuenow={passed + failed}
			className={cn(
				"flex h-1 w-full overflow-hidden rounded-full bg-muted",
				className,
			)}
		>
			<div className="h-full bg-green-500" style={{ width: pct(passed) }} />
			<div className="h-full bg-red-500" style={{ width: pct(failed) }} />
			<div className="h-full bg-blue-500/40" style={{ width: pct(running) }} />
		</div>
	);
};

export const Actor = ({
	actor,
	compact,
}: {
	actor: z.infer<typeof ActorRef>;
	compact?: boolean;
}) => {
	const agent = isAgentVia(actor.via);
	const system = actor.via === "system";
	return (
		<Tooltip
			content={
				<span>
					{actor.email} · <span className="font-mono">{actor.via}</span>
				</span>
			}
		>
			<span className="inline-flex min-w-0 items-center gap-1.5 text-sm text-tertiary-foreground">
				<span
					className={cn(
						"flex size-4.5 shrink-0 items-center justify-center rounded-full text-[9px] font-semibold uppercase",
						agent
							? "bg-blue-500/10 text-blue-600 dark:text-blue-400"
							: system
								? "bg-muted text-tertiary-foreground"
								: "bg-muted text-foreground",
					)}
				>
					{agent ? (
						<Bot className="size-3" />
					) : system ? (
						<UserRound className="size-3" />
					) : (
						handle(actor.email).slice(0, 1)
					)}
				</span>
				<span className="truncate">{handle(actor.email)}</span>
				{!compact && agent && (
					<span className="truncate font-mono text-[11px] text-subtle">
						{actor.via.replace("api_key:", "key:")}
					</span>
				)}
			</span>
		</Tooltip>
	);
};

/** Renders any thrown error; ApiRequestError shows message, next and escalate. */
export const ErrorCallout = ({
	error,
	className,
}: {
	error: unknown;
	className?: string;
}) => {
	if (!error) return null;
	const body =
		error instanceof ApiRequestError
			? error.body
			: {
					code: "client",
					message: error instanceof Error ? error.message : String(error),
					next: "Retry; if it repeats, report it.",
					escalate: null,
				};
	return (
		<div
			role="alert"
			className={cn(
				"rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-sm",
				className,
			)}
		>
			<div className="flex items-start gap-2">
				<CircleAlert className="mt-0.5 size-3.5 shrink-0 text-red-600 dark:text-red-400" />
				<div className="min-w-0 space-y-1">
					<p className="font-medium text-pretty text-foreground">
						{body.message}{" "}
						<span className="font-mono text-[11px] font-normal text-subtle">
							{body.code}
						</span>
					</p>
					<p className="text-pretty text-tertiary-foreground">
						<span className="text-foreground">Next:</span> {body.next}
					</p>
				</div>
			</div>
			{body.escalate && (
				<div className="mt-2 flex items-start gap-2 rounded-md border border-orange-400/25 bg-orange-400/10 px-2.5 py-2 text-xs">
					<AlertTriangle className="mt-px size-3.5 shrink-0 text-orange-600 dark:text-orange-400" />
					<p className="text-pretty text-foreground">
						<span className="font-medium">Needs a human:</span> {body.escalate}
					</p>
				</div>
			)}
		</div>
	);
};
