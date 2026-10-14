import { type ComponentType, lazy, useState } from "react";

/**
 * React.lazy that renders synchronously once its chunk is preloaded. Plain lazy
 * always suspends on first render, and React then holds the reveal for 300ms.
 */
export const lazyWithPreload = <Props extends object>(
	load: () => Promise<{ default: ComponentType<Props> }>,
) => {
	let loaded: ComponentType<Props> | undefined;
	let pending: Promise<{ default: ComponentType<Props> }> | undefined;

	const preload = () => {
		pending ??= load().then((module) => {
			loaded = module.default;
			return module;
		});
		return pending;
	};

	const LazyComponent = lazy(preload);

	const PreloadableComponent = (props: Props) => {
		// Fixed for the component's lifetime, so a later preload never swaps it and remounts.
		const [Component] = useState<ComponentType<Props>>(
			() => loaded ?? LazyComponent,
		);
		return <Component {...props} />;
	};

	return Object.assign(PreloadableComponent, {
		preload,
		isLoaded: () => loaded !== undefined,
	});
};
