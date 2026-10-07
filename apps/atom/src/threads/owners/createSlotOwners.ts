import { createOwnerLink, type OwnerLink } from "./createOwnerLink.js";
import type { SlotOwners } from "./types/slotOwners.js";

/** This thread's view of the owners, with the controls only the thread itself uses. */
export type ThreadOwners = SlotOwners & {
	connect(params: { thread: number; port: MessagePort }): void;
	disconnect(params: { thread: number }): void;
	/** Calls sent to every other thread and not yet answered. */
	callsWaiting(): number;
};

/** Slot `s` belongs to thread `s % threads`: fixed for the life of the process, so a customer never changes owner. */
export const createSlotOwners = ({
	index,
	threads,
}: {
	index: number;
	threads: number;
}): ThreadOwners => {
	const links: OwnerLink[] = Array.from({ length: threads }, (_, thread) =>
		createOwnerLink({ thread }),
	);
	return {
		index,
		threads,
		ownerOf: ({ slot }) => slot % threads,
		processorOn: ({ thread, atomId }) => links[thread].processorFor({ atomId }),
		catalogOn: ({ thread, atomId }) => links[thread].catalogFor({ atomId }),
		connect: ({ thread, port }) => links[thread].connect({ port }),
		disconnect: ({ thread }) => links[thread].disconnect(),
		callsWaiting: () => links.reduce((sum, link) => sum + link.waiting(), 0),
	};
};
