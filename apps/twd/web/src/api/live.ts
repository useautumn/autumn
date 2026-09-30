import { useEffect, useSyncExternalStore } from "react";
import {
	type LiveClientMessage,
	LiveServerMessage,
} from "../../../src/api/contract.ts";
import { type LiveConnection, transport } from "./client.ts";

export type LiveStatus = "connecting" | "live" | "reconnecting" | "offline";

const PING_MS = 20_000;
const BACKOFF_BASE_MS = 500;
const BACKOFF_MAX_MS = 30_000;
/** Failed attempts in a row before the indicator says offline (it keeps retrying). */
const OFFLINE_AFTER = 4;

type Listener = (msg: LiveServerMessage) => void;

/**
 * One WebSocket per tab. Topics are ref-counted across components; every held
 * topic is resubscribed after a reconnect, and a seq gap forces a reconnect.
 */
class LiveSocket {
	status: LiveStatus = "connecting";
	private conn: LiveConnection | null = null;
	private open = false;
	private lastSeq: number | null = null;
	private attempt = 0;
	private retryTimer: ReturnType<typeof setTimeout> | undefined;
	private pingTimer: ReturnType<typeof setInterval> | undefined;
	private readonly refs = new Map<string, number>();
	private readonly listeners = new Set<Listener>();
	private readonly statusListeners = new Set<() => void>();

	/** Holds a topic until the returned release runs. */
	hold = (topic: string) => {
		const n = this.refs.get(topic) ?? 0;
		this.refs.set(topic, n + 1);
		this.start();
		if (n === 0) this.send({ type: "subscribe", topics: [topic] });
		let released = false;
		return () => {
			if (released) return;
			released = true;
			const left = (this.refs.get(topic) ?? 1) - 1;
			if (left > 0) return void this.refs.set(topic, left);
			this.refs.delete(topic);
			this.send({ type: "unsubscribe", topics: [topic] });
		};
	};

	listen = (listener: Listener) => {
		this.listeners.add(listener);
		return () => void this.listeners.delete(listener);
	};

	onStatus = (listener: () => void) => {
		this.statusListeners.add(listener);
		return () => void this.statusListeners.delete(listener);
	};

	start = () => {
		if (this.conn || this.retryTimer) return;
		this.connect();
	};

	private setStatus(status: LiveStatus) {
		if (this.status === status) return;
		this.status = status;
		for (const l of this.statusListeners) l();
	}

	private send(msg: LiveClientMessage) {
		if (this.open) this.conn?.send(JSON.stringify(msg));
	}

	private connect() {
		this.retryTimer = undefined;
		this.lastSeq = null;
		this.conn = transport.openLive({
			onOpen: () => {
				this.open = true;
				const topics = [...this.refs.keys()];
				if (topics.length) this.send({ type: "subscribe", topics });
				this.pingTimer = setInterval(
					() => this.send({ type: "ping" }),
					PING_MS,
				);
			},
			onMessage: (text) => this.receive(text),
			onClose: () => this.reconnect(),
		});
	}

	private receive(text: string) {
		let json: unknown;
		try {
			json = JSON.parse(text);
		} catch {
			return console.warn("twd live: non-JSON frame dropped");
		}
		const parsed = LiveServerMessage.safeParse(json);
		if (!parsed.success)
			return console.warn("twd live: frame outside the contract", parsed.error);
		const msg = parsed.data;
		if (msg.type === "hello") {
			this.attempt = 0;
			this.setStatus("live");
		}
		if (msg.type === "event") {
			if (this.lastSeq !== null && msg.seq !== this.lastSeq + 1)
				return this.reconnect();
			this.lastSeq = msg.seq;
		}
		for (const l of this.listeners) l(msg);
	}

	private reconnect() {
		clearInterval(this.pingTimer);
		this.conn?.close();
		this.conn = null;
		this.open = false;
		this.attempt += 1;
		this.setStatus(
			this.attempt >= OFFLINE_AFTER || !navigator.onLine
				? "offline"
				: "reconnecting",
		);
		const ceiling = Math.min(
			BACKOFF_MAX_MS,
			BACKOFF_BASE_MS * 2 ** (this.attempt - 1),
		);
		this.retryTimer = setTimeout(
			() => this.connect(),
			ceiling / 2 + Math.random() * (ceiling / 2),
		);
	}
}

export const liveSocket = new LiveSocket();

export const useLiveStatus = () =>
	useSyncExternalStore(liveSocket.onStatus, () => liveSocket.status);

/** Keeps these topics subscribed while the component is mounted. */
export const useLiveTopics = (...topics: (string | false | null)[]) => {
	const key = topics.filter(Boolean).join(" ");
	useEffect(() => {
		const releases = key ? key.split(" ").map(liveSocket.hold) : [];
		return () => {
			for (const release of releases) release();
		};
	}, [key]);
};

/** Slow safety refetch, only while the socket is down. */
export const whileDisconnected = () =>
	liveSocket.status === "live" ? false : 60_000;
