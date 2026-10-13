/**
 * What a thread sends one port in a turn of its event loop goes as one message: each message wakes the receiving
 * thread, and under load that wake costs more than the call it carries.
 */
export const createPortBatcher = () => {
	const pending = new Map<MessagePort, unknown[]>();

	function flush(): void {
		for (const [port, messages] of pending) port.postMessage(messages);
		pending.clear();
	}

	return function send({
		port,
		message,
	}: {
		port: MessagePort;
		message: unknown;
	}): void {
		const messages = pending.get(port);
		if (messages) return void messages.push(message);
		if (pending.size === 0) setImmediate(flush);
		pending.set(port, [message]);
	};
};
