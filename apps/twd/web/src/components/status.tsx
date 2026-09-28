import { AlertTriangle, Bot, CircleAlert, UserRound } from "lucide-react";
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

type Tone = "ok" | "bad" | "warn" | "info" | "idle";

const DOT: Record<Tone, string> = {
	ok: "bg-ok",
	bad: "bg-bad",
	warn: "bg-warn",
	info: "bg-info",
	idle: "bg-faint",
};
const TEXT: Record<Tone, string> = {
	ok: "text-ok",
	bad: "text-bad",
	warn: "text-warn",
	info: "text-info",
	idle: "text-muted",
};

const RUN_TONE: Record<z.infer<typeof RunStatus>, Tone> = {
	queued: "idle",
	warming: "warn",
	provisioning: "info",
	running: "info",
	tearing_down: "info",
	passed: "ok",
	failed: "bad",
	cancelled: "idle",
	errored: "bad",
};
const FILE_TONE: Record<z.infer<typeof FileResultStatus>, Tone> = {
	queued: "idle",
	running: "info",
	passed: "ok",
	failed: "bad",
	crashed: "bad",
	skipped: "idle",
};
const LIVE = new Set([
	"queued",
	"warming",
	"provisioning",
	"running",
	"tearing_down",
]);

export const StatusDot = ({ tone, pulse }: { tone: Tone; pulse?: boolean }) => (
	<span
		aria-hidden
		className={cn(
			"inline-block size-1.5 shrink-0 rounded-full",
			DOT[tone],
			pulse && "twd-pulse",
		)}
	/>
);

const label = (s: string) => s.replace(/_/g, " ");

export const RunStatusBadge = ({
	status,
}: {
	status: z.infer<typeof RunStatus>;
}) => (
	<span
		className={cn(
			"inline-flex items-center gap-1.5 text-xs font-medium",
			TEXT[RUN_TONE[status]],
		)}
	>
		<StatusDot tone={RUN_TONE[status]} pulse={LIVE.has(status)} />
		{label(status)}
	</span>
);

export const FileStatusBadge = ({
	status,
}: {
	status: z.infer<typeof FileResultStatus>;
}) => (
	<span
		className={cn(
			"inline-flex items-center gap-1.5 text-xs",
			TEXT[FILE_TONE[status]],
		)}
	>
		<StatusDot tone={FILE_TONE[status]} />
		{status}
	</span>
);

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
			"inline-flex h-5 items-center gap-1 rounded px-1.5 text-[11px] font-medium whitespace-nowrap",
			tone === "ok" && "bg-ok-soft text-ok",
			tone === "bad" && "bg-bad-soft text-bad",
			tone === "warn" && "bg-warn-soft text-warn",
			tone === "info" && "bg-info-soft text-info",
			tone === "idle" && "bg-raised text-muted",
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
				"flex h-1.5 w-full overflow-hidden rounded-full bg-raised",
				className,
			)}
		>
			<div className="h-full bg-ok" style={{ width: pct(passed) }} />
			<div className="h-full bg-bad" style={{ width: pct(failed) }} />
			<div className="h-full bg-info/40" style={{ width: pct(running) }} />
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
			<span className="inline-flex min-w-0 items-center gap-1.5 text-xs text-fg">
				<span
					className={cn(
						"flex size-4.5 shrink-0 items-center justify-center rounded-full text-[9px] font-semibold uppercase",
						agent
							? "bg-info-soft text-info"
							: system
								? "bg-raised text-muted"
								: "bg-raised text-fg",
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
					<span className="truncate font-mono text-[11px] text-faint">
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
				"rounded-lg border border-bad/25 bg-bad-soft px-3 py-2.5 text-[13px]",
				className,
			)}
		>
			<div className="flex items-start gap-2">
				<CircleAlert className="mt-0.5 size-3.5 shrink-0 text-bad" />
				<div className="min-w-0 space-y-1">
					<p className="font-medium text-pretty text-fg">
						{body.message}{" "}
						<span className="font-mono text-[11px] font-normal text-faint">
							{body.code}
						</span>
					</p>
					<p className="text-pretty text-muted">
						<span className="text-fg">Next:</span> {body.next}
					</p>
				</div>
			</div>
			{body.escalate && (
				<div className="mt-2 flex items-start gap-2 rounded-md border border-warn/25 bg-warn-soft px-2.5 py-2 text-xs">
					<AlertTriangle className="mt-px size-3.5 shrink-0 text-warn" />
					<p className="text-pretty text-fg">
						<span className="font-medium">Needs a human:</span> {body.escalate}
					</p>
				</div>
			)}
		</div>
	);
};
