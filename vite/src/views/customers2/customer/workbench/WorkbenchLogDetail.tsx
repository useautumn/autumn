import CopyButton from "@/components/general/CopyButton";
import {
	type RequestLogEntry,
	useCusRequestLogsQuery,
} from "@/hooks/queries/useCusRequestLogsQuery";
import { useWorkbenchStore } from "@/hooks/stores/useWorkbenchStore";
import { cn } from "@/lib/utils";
import { WorkbenchJsonViewer } from "./WorkbenchJsonViewer";
import {
	extractRes,
	extractScope,
	formatLogDateTime,
	methodColorClass,
	statusBadgeClass,
	statusText,
} from "./workbenchUtils";

export const WorkbenchLogDetail = ({
	customerId,
	isOpen,
}: {
	customerId: string | undefined;
	isOpen: boolean;
}) => {
	const selectedLogId = useWorkbenchStore((s) => s.selectedLogId);
	const { logs } = useCusRequestLogsQuery({ customerId, enabled: isOpen });

	const log = logs.find((l) => l.id === selectedLogId) ?? null;

	if (!log) {
		return (
			<div className="flex-1 min-h-0 flex items-center justify-center text-xs text-subtle">
				Select a request to view details
			</div>
		);
	}

	return (
		<div className="flex-1 min-h-0 overflow-y-auto p-4 text-sm">
			<DetailHeader log={log} />
			<DetailRows log={log} />
			<ReqResSplit raw={log.raw} />
			<ContextViewer raw={log.raw} />
			<RawJsonViewer raw={log.raw} />
		</div>
	);
};

const SectionLabel = ({ children }: { children: React.ReactNode }) => (
	<div className="text-[10px] uppercase tracking-wide text-subtle font-semibold mb-1.5">
		{children}
	</div>
);

const ReqResSplit = ({ raw }: { raw: Record<string, unknown> }) => {
	const req = extractScope(raw, "req");
	const res = extractRes(raw);
	const reqData = Object.keys(req).length > 0 ? req : {};
	const resData =
		res && typeof res === "object" && Object.keys(res).length > 0 ? res : {};

	return (
		<div className="mt-6 grid grid-cols-2 gap-3">
			<div>
				<SectionLabel>Request</SectionLabel>
				<WorkbenchJsonViewer data={reqData} height="200px" />
			</div>
			<div>
				<SectionLabel>Response</SectionLabel>
				<WorkbenchJsonViewer data={resData} height="200px" />
			</div>
		</div>
	);
};

const ContextViewer = ({ raw }: { raw: Record<string, unknown> }) => {
	const ctx = extractScope(raw, "context");
	const data = Object.keys(ctx).length > 0 ? ctx : {};
	return (
		<div className="mt-6">
			<SectionLabel>Context</SectionLabel>
			<WorkbenchJsonViewer data={data} height="180px" />
		</div>
	);
};

const DetailHeader = ({ log }: { log: RequestLogEntry }) => (
	<div className="mb-4 pb-3 border-b border-border/40">
		<div className="text-[10px] uppercase tracking-wide text-subtle font-semibold mb-1">
			API request
		</div>
		<div className="flex items-center gap-2 font-mono text-sm">
			<span className={cn("font-semibold", methodColorClass(log.method))}>
				{log.method ?? "—"}
			</span>
			<span className="text-foreground break-all">
				{log.path ?? "(unknown)"}
			</span>
		</div>
	</div>
);

const Row = ({
	label,
	children,
}: {
	label: string;
	children: React.ReactNode;
}) => (
	<>
		<dt className="text-tertiary-foreground text-xs py-1">{label}</dt>
		<dd className="text-foreground text-xs py-1 min-w-0">{children}</dd>
	</>
);

const DetailRows = ({ log }: { log: RequestLogEntry }) => (
	<dl className="grid grid-cols-[110px_1fr] gap-x-4">
		<Row label="Status">
			<span
				className={cn(
					"inline-flex items-center px-1.5 py-0 rounded text-[11px] font-medium border tabular-nums",
					statusBadgeClass(log.statusCode),
				)}
			>
				{statusText(log.statusCode)}
			</span>
		</Row>

		{log.reqId && (
			<Row label="Request ID">
				<div className="flex items-center gap-1.5 min-w-0">
					<span className="font-mono break-all">{log.reqId}</span>
					<CopyButton
						text={log.reqId}
						className="bg-transparent shadow-none hover:bg-stone-200 dark:hover:bg-stone-800 w-5 gap-0 h-5 !px-0 py-0 flex items-center justify-center text-tertiary-foreground shrink-0"
					/>
				</div>
			</Row>
		)}

		<Row label="Time">
			<span>{formatLogDateTime(log.time)}</span>
		</Row>

		{log.durationMs != null && (
			<Row label="Duration">
				<span className="tabular-nums">{log.durationMs}ms</span>
			</Row>
		)}

		{log.ip && (
			<Row label="IP address">
				<span className="font-mono">{log.ip}</span>
			</Row>
		)}

		{log.userAgent && (
			<Row label="User agent">
				<span className="break-all">{log.userAgent}</span>
			</Row>
		)}

		{log.customerId && (
			<Row label="Customer ID">
				<span className="font-mono break-all">{log.customerId}</span>
			</Row>
		)}
	</dl>
);

const RawJsonViewer = ({ raw }: { raw: Record<string, unknown> }) => (
	<div className="mt-6">
		<SectionLabel>Raw event</SectionLabel>
		<WorkbenchJsonViewer data={raw} height="320px" />
	</div>
);
