import { feature, item, plan } from "atmn";

// Features
export const messages = feature({
	id: 'messages',
	name: 'Messages',
	type: 'metered',
	consumable: true,
});

// Plans
export const free = plan({
	id: 'free',
	name: 'Free',
	items: [
		item({
			featureId: messages.id,
			included: 10,
			reset: {
				interval: 'one_off',
			},
		}),
	],
});
