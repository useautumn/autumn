import {
	type ComponentType,
	lazy,
	useState,
	useSyncExternalStore,
} from "react";

/**
 * React.lazy that renders synchronously once its chunk is preloaded. Plain lazy
 * always suspends on first render, and React then holds the reveal for 300ms.
 */
export const lazyWithPreload = <Props extends object>(
	load: () => Promise<{ default: ComponentType<Props> }>,
) => {
	let loaded: ComponentType<Props> | undefined;
	let pending: Promise<{ default: ComponentType<Props> }> | undefined;
	const listeners = new Set<() => void>();

	const preload = () => {
		pending ??= load().then((module) => {
			loaded = module.default;
			for (const listener of listeners) listener();
			return module;
		});
		return pending;
	};

	const isLoaded = () => loaded !== undefined;

	// Subscribing starts the load, so a caller waiting on the chunk never has to kick it off.
	const subscribe = (listener: () => void) => {
		listeners.add(listener);
		void preload();
		return () => {
			listeners.delete(listener);
		};
	};

	const LazyComponent = lazy(preload);

	const PreloadableComponent = (props: Props) => {
		// Fixed for the component's lifetime, so a later preload never swaps it and remounts.
		const [Component] = useState<ComponentType<Props>>(
			() => loaded ?? LazyComponent,
		);
		return <Component {...props} />;
	};

	return Object.assign(PreloadableComponent, { preload, isLoaded, subscribe });
};

type PreloadableChunk = {
	isLoaded: () => boolean;
	subscribe: (listener: () => void) => () => void;
};

const alwaysLoaded = () => true;
const noopSubscribe = () => () => {};

/** Loads a preloadable route chunk and reports whether it is in. */
export const useChunkLoaded = (chunk: PreloadableChunk | undefined) =>
	useSyncExternalStore(
		chunk?.subscribe ?? noopSubscribe,
		chunk?.isLoaded ?? alwaysLoaded,
	);
