// Queued follow-up texts for one run; the engine pump drains this at turn boundaries.
export class FollowUpQueue {
	/** Installed by the pump to request an interrupt when a live turn should pivot. */
	onPush?: () => void;
	private items: string[] = [];
	private closedFlag = false;

	get closed() {
		return this.closedFlag;
	}

	get size() {
		return this.items.length;
	}

	close() {
		this.closedFlag = true;
	}

	drain() {
		return this.items.splice(0);
	}

	/** Ignores the closed flag: a failed send is the one caller and must not lose items. */
	restore(items: string[]) {
		this.items.unshift(...items);
	}

	push(text: string) {
		if (this.closedFlag) throw new Error("Run is closing");
		this.items.push(text);
		this.onPush?.();
	}
}
