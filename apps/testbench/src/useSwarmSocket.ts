import { useCallback, useEffect, useRef, useState } from "react";
import type { Snapshot } from "./types";

type Sub = { kind: "file" | "worker"; key: string } | null;

export type SwarmSocket = {
	connected: boolean;
	snapshot: Snapshot | null;
	/** The active subscription's accumulated raw output (buffer + streamed chunks). */
	output: string;
	sub: Sub;
	subscribeFile: (file: string) => void;
	subscribeWorker: (worker: string) => void;
};

/**
 * Connects to the swarm dashboard WS. Holds the latest metadata snapshot and,
 * for the ONE active subscription (a file's test output or a worker's server
 * output), the accumulating raw text. Auto-reconnects with backoff and re-sends
 * the active subscription on reconnect.
 */
export const useSwarmSocket = (wsUrl: string | null): SwarmSocket => {
	const [connected, setConnected] = useState(false);
	const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
	const [output, setOutput] = useState("");
	const [sub, setSub] = useState<Sub>(null);

	const wsRef = useRef<WebSocket | null>(null);
	const subRef = useRef<Sub>(null);
	const retryRef = useRef(0);
	const closedRef = useRef(false);

	const send = useCallback((msg: unknown) => {
		const ws = wsRef.current;
		if (ws && ws.readyState === WebSocket.OPEN) {
			ws.send(JSON.stringify(msg));
		}
	}, []);

	const applySub = useCallback(
		(next: Sub) => {
			subRef.current = next;
			setSub(next);
			setOutput("");
			if (next?.kind === "file") {
				send({ type: "subscribeFile", file: next.key });
			} else if (next?.kind === "worker") {
				send({ type: "subscribeWorker", worker: next.key });
			}
		},
		[send],
	);

	const subscribeFile = useCallback(
		(file: string) => applySub({ kind: "file", key: file }),
		[applySub],
	);
	const subscribeWorker = useCallback(
		(worker: string) => applySub({ kind: "worker", key: worker }),
		[applySub],
	);

	// biome-ignore lint/correctness/useExhaustiveDependencies: reconnect loop is keyed on wsUrl only
	useEffect(() => {
		if (!wsUrl) {
			return;
		}
		closedRef.current = false;
		let timer: ReturnType<typeof setTimeout> | undefined;

		const connect = () => {
			const ws = new WebSocket(wsUrl);
			wsRef.current = ws;

			ws.onopen = () => {
				retryRef.current = 0;
				setConnected(true);
				// Re-send the active subscription after a reconnect.
				const current = subRef.current;
				if (current?.kind === "file") {
					send({ type: "subscribeFile", file: current.key });
				} else if (current?.kind === "worker") {
					send({ type: "subscribeWorker", worker: current.key });
				}
			};

			ws.onmessage = (event) => {
				let msg: {
					type: string;
					data?: Snapshot;
					file?: string;
					worker?: string;
					output?: string;
					chunk?: string;
				};
				try {
					msg = JSON.parse(event.data as string);
				} catch {
					return;
				}
				if (msg.type === "snapshot" && msg.data) {
					setSnapshot(msg.data);
				} else if (msg.type === "fileBuffer" || msg.type === "workerBuffer") {
					setOutput(msg.output ?? "");
				} else if (msg.type === "fileOutput") {
					if (subRef.current?.kind === "file" && subRef.current.key === msg.file) {
						setOutput((prev) => prev + (msg.chunk ?? ""));
					}
				} else if (msg.type === "workerOutput") {
					if (
						subRef.current?.kind === "worker" &&
						subRef.current.key === msg.worker
					) {
						setOutput((prev) => prev + (msg.chunk ?? ""));
					}
				}
			};

			ws.onclose = () => {
				setConnected(false);
				if (closedRef.current) {
					return;
				}
				retryRef.current += 1;
				const delay = Math.min(5000, 300 * 2 ** retryRef.current);
				timer = setTimeout(connect, delay);
			};
			ws.onerror = () => ws.close();
		};

		connect();
		return () => {
			closedRef.current = true;
			if (timer) {
				clearTimeout(timer);
			}
			wsRef.current?.close();
		};
	}, [wsUrl]);

	return { connected, snapshot, output, sub, subscribeFile, subscribeWorker };
};
