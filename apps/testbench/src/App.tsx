import { Activity, FileText, Server } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { PageContainer } from "@/components/general/PageContainer";
import { PageHeader } from "@/components/general/PageHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { useSwarmSocket } from "./useSwarmSocket";
import { Overall } from "./views/Overall";
import { PerFile } from "./views/PerFile";
import { PerWorker } from "./views/PerWorker";

const WS_STORAGE_KEY = "testbench-ws-url";

function resolveWsUrl(): string {
	const params = new URLSearchParams(window.location.search);
	const fromQuery = params.get("ws");
	if (fromQuery) {
		localStorage.setItem(WS_STORAGE_KEY, fromQuery);
		return fromQuery;
	}
	const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
	const sameOrigin = `${proto}//${window.location.host}/ws`;
	// On the standalone dev server (:5910) the WS lives on another port, so fall
	// back to the last-used URL; otherwise we're served by the dashboard server
	// itself → connect to /ws on this same origin (no ?ws needed).
	if (window.location.port === "5910") {
		return localStorage.getItem(WS_STORAGE_KEY) ?? sameOrigin;
	}
	return sameOrigin;
}

export function App() {
	const [wsUrl, setWsUrl] = useState(resolveWsUrl);
	const [tab, setTab] = useState("overall");
	const socket = useSwarmSocket(wsUrl);
	const snap = socket.snapshot;

	const openFile = useCallback(
		(file: string) => {
			socket.subscribeFile(file);
			setTab("file");
		},
		[socket],
	);
	const status = useMemo(() => {
		if (!socket.connected) {
			return { dot: "bg-red-500", label: "disconnected" };
		}
		if (!snap) {
			return { dot: "bg-yellow-400", label: "connecting…" };
		}
		return { dot: "bg-green-500", label: snap.phase };
	}, [socket.connected, snap]);

	return (
		<PageContainer className="max-w-[1400px]">
			<PageHeader
				icon={<Activity className="size-4" />}
				title="testbench — swarm"
			>
				<div className="flex items-center gap-2 text-muted-foreground text-xs">
					<span className={cn("size-2 rounded-full", status.dot)} />
					<span>{status.label}</span>
					<input
						className="w-64 rounded-md border bg-card px-2 py-1 font-mono text-xs outline-none focus:ring-1 focus:ring-ring"
						defaultValue={wsUrl}
						onKeyDown={(e) => {
							if (e.key === "Enter") {
								const v = (e.target as HTMLInputElement).value.trim();
								localStorage.setItem(WS_STORAGE_KEY, v);
								setWsUrl(v);
							}
						}}
						placeholder="ws://…"
						spellCheck={false}
					/>
				</div>
			</PageHeader>

			{snap ? (
				<Tabs onValueChange={(v) => setTab(v as string)} value={tab}>
					<TabsList>
						<TabsTrigger value="overall">
							<Activity className="mr-1.5 size-3.5" /> Overall
						</TabsTrigger>
						<TabsTrigger value="file">
							<FileText className="mr-1.5 size-3.5" /> Per-file
						</TabsTrigger>
						<TabsTrigger value="worker">
							<Server className="mr-1.5 size-3.5" /> Per-worker
						</TabsTrigger>
					</TabsList>
					<TabsContent value="overall">
						<Overall onOpenFile={openFile} snap={snap} />
					</TabsContent>
					<TabsContent value="file">
						<PerFile snap={snap} socket={socket} />
					</TabsContent>
					<TabsContent value="worker">
						<PerWorker onOpenFile={openFile} snap={snap} socket={socket} />
					</TabsContent>
				</Tabs>
			) : (
				<div className="flex h-64 items-center justify-center text-muted-foreground text-sm">
					{socket.connected
						? "waiting for the first snapshot…"
						: "no connection — paste the dashboard ws:// URL above"}
				</div>
			)}
		</PageContainer>
	);
}
