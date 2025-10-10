import { AutumnInt } from "./src/external/autumn/autumnCli";

const main = async () => {
	const autumn = new AutumnInt({
		apiKey: "am_sk_test_HJoiQJZhDrha118nNaMfCPnIVfTpwnxEXFThfnzJU6",
	});

    const res = await Promise.all([
        autumn.track({
            feature_id: "credits",
            customer_id: "TestCustomer",
            value: 80
        }),
        autumn.track({
            feature_id: "credits",
            customer_id: "TestCustomer",
            value: 80
        }),
        
    ])


    console.log(res);
};

main().then(() => {
	console.log("done");
});