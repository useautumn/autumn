#!/usr/bin/env python3
"""A prod-shaped request mix for one balance-worker task: path<TAB>body per line, __ID__ made unique by the loadgen.

Shares are of all requests. Checks are snapshot 3's share (5,845 check rps : 4,376 track rps). The hot customer is
cus_1; warm residents cus_w<i> are drawn Zipf(s); each reset-due resident cus_r<i> and each cold customer cus_c<i>
is touched exactly once, so every such request forces the classic path (reset advance or Postgres load).
"""
import json, random, sys, argparse

ap = argparse.ArgumentParser()
ap.add_argument("--out", required=True)
ap.add_argument("--lines", type=int, default=240_000)
ap.add_argument("--hot", type=float, default=0.66)
ap.add_argument("--cold", type=float, default=0.01)
ap.add_argument("--reset", type=float, default=0.005)
ap.add_argument("--warm", type=int, default=2000)
ap.add_argument("--reset-pool", type=int, default=2500)
ap.add_argument("--zipf", type=float, default=1.0)
ap.add_argument("--checks", type=float, default=5845 / (5845 + 4376))
ap.add_argument("--features", type=int, default=6)
ap.add_argument("--seed", type=int, default=7)
a = ap.parse_args()
rng = random.Random(a.seed)
import os
base = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "rust-front")
track = json.load(open(f"{base}/track-template.json"))
check = json.load(open(f"{base}/check-template.json"))

weights = [1 / (i + 1) ** a.zipf for i in range(a.warm)]
total_w = sum(weights)
cum, acc = [], 0.0
for w in weights:
    acc += w / total_w
    cum.append(acc)

import bisect
def warm_id():
    return f"cus_w{bisect.bisect_left(cum, rng.random())}"

def body(kind, customer, feature):
    t = json.loads(json.dumps(track if kind == "track" else check))
    c = t["command"]
    c["identity"]["customerId"] = customer
    c["featureId"] = f"feature_{feature}"
    c["internalFeatureId"] = f"feat_feature_{feature}"
    if kind == "track":
        c["usageEvent"]["name"] = f"feature_{feature}"
    return json.dumps(t, separators=(",", ":"))

counts = {"hot": 0, "warm": 0, "cold": 0, "reset": 0, "track": 0, "check": 0}
cold_n = reset_n = 0
with open(a.out, "w") as f:
    for _ in range(a.lines):
        u = rng.random()
        if u < a.hot:
            who, customer = "hot", "cus_1"
        elif u < a.hot + a.cold:
            who, customer = "cold", f"cus_c{cold_n}"; cold_n += 1
        elif u < a.hot + a.cold + a.reset and reset_n < a.reset_pool:
            who, customer = "reset", f"cus_r{reset_n}"; reset_n += 1
        else:
            who, customer = "warm", warm_id()
        kind = "check" if rng.random() < a.checks else "track"
        counts[who] += 1; counts[kind] += 1
        f.write(f"/v1/{kind}\t{body(kind, customer, rng.randrange(a.features))}\n")
print(json.dumps({"out": a.out, **counts, "coldIds": cold_n, "resetIds": reset_n}))
