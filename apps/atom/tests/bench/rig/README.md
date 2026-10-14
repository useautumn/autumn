# Atom staging-faithful rig (bench only, never merged)

Reproduces staging's hot-customer ceiling on three EC2 boxes in one eu-west-2 VPC/subnet:

| Box | Type | Runs |
|---|---|---|
| Replica A | c8g.xlarge | the real Atom entry point (`src/main.ts`), multi-tenant, 3 threads, 128 slots |
| Replica B | c8g.xlarge | the same |
| Driver | c8g.2xlarge | the worker-faithful Autumn stub plus the load generator (6 processes) |

Branches (every box must check out the same one; each run records which in `meta.json` as `variant`):
- `bench/atom-rig` (default): the deductions chain top (#4770) **without** #4765. `variant: "chain-top"`.
- `bench/atom-rig-render`: the same plus #4765's three engine-render commits. `variant: "chain-top+4765"`.

## 0. Security group (one group for all three boxes)

Allow inbound from the group itself: TCP 8790 (checks, pushes, `/health`), 8791 (replica to replica), 18877 (the replicas' calls to the stub on the driver).

## 1. Every box: Bun 1.4.2 (the Atom release's pin) and the branch

```sh
curl -fsSL https://bun.sh/install | bash -s "bun-v1.4.2" && export PATH="$HOME/.bun/bin:$PATH" \
&& git clone --depth 1 --branch bench/atom-rig https://github.com/useautumn/autumn.git atom-rig \
&& cd atom-rig && bun install --frozen-lockfile && cd apps/atom && bun --revision
```

Set these once per shell, on every box. `A`, `B` and `D` are the boxes' private IPs. The peer secret is any 64 hex characters, the same on both replicas.

```sh
export A=<replica A IP> B=<replica B IP> D=<driver IP> SECRET=<openssl rand -hex 32, the same on A and B>
```

## 2. Replica A, then replica B (one command each)

Each replica finds its peer as `atom.svc`, from `/etc/hosts` lines its supervisor rewrites (run as root, as the boxes do):
the same lookup and 5 s cache as on Alien, and the driver decides when a record comes and goes.

```sh
# Replica A
bun run rig:replica --self $A --peer $B --stub http://$D:18877 --peer-secret $SECRET

# Replica B
bun run rig:replica --self $B --peer $A --stub http://$D:18877 --peer-secret $SECRET
```

Each prints one JSON line (variant, Bun revision, data dir, control URL, log path) and supervises the Atom until Ctrl-C.
The log is `~/atom-rig/replica-<ip>.log`. Every supervisor start uses a fresh data dir, which its Atom keeps across the
restarts the driver asks for (as a container keeps its volume), so restart both supervisors between runs.

The supervisor's control port (`replica.controlPort`, 8799; the rig's security group must admit it): `GET /status`,
`POST /stop` (SIGTERM, returns when the Atom exited), `POST /start {peers?, srcDir?}` (the same data dir), `POST /peers {peers}`
(what `atom.svc` resolves to on this box besides itself).

## 3. Driver (one command)

```sh
ulimit -n 65536 && bun run rig:driver --replicas $A,$B
```

The driver:
1. Starts the Autumn stub on :18877. The stub applies each `tracks.append` (`writerId` per track) with the engine and pushes the customer to a random replica after a herald-like lag (log-normal, p50 0.35 s, p99 1.2 s). It answers `subjects.read` settle pulls, `keys.check`, and any check a replica forwards to the API.
2. Registers the tenant on both replicas with `atoms.put`.
3. Seeds 7,000 resend-shaped customers through `subjects.set`, each to one random replica (the relay carries it to the other). The shape is 14 balances, 9 features, 3 products and one expired usage window, and the hot customer is included.
4. Runs the traffic, with every request going to a random replica, so about 50% hop:
   - Background: 1,300 deductions/s flat across the pair, plus 3.8 read checks per deduction (4.8 checks per deduction overall). Each customer's share is drawn from a per-customer rate distribution with p50 1/s, p99 12/s and p99.9 76/s.
   - Hot customer `cus_hot`: after a 20 s warmup it steps through 4, 8, 12, 16, 20, 30, 40, 50, 60, 80, 100 and 120 × 20.7 deductions/s (capped at 2,500/s), 10 s per step, with 0.6 read checks per deduction.
5. Prints one line per step: hot and others req/s, answered share, p99, shed and forwarded.

## 4. Outputs (on the driver)

`~/atom-rig/runs/<timestamp>/` contains:
- `meta.json`: variant, git sha, Bun revision, steps and the full config.
- `steps.jsonl`: per step, for the hot customer and for the others: sent/s, answered share, forwarded (with reasons), shed, failed, p50 and p99.
- `health.jsonl`: every replica's `/health` every 10 s. It includes each thread's stage clock (the finer engine stages too), `heapBytes`, the fold, relay and pull counters, and journal state.
- `stub.jsonl`: the stub's totals (tracks applied, pushes, failed pushes, pulls, forwards by route).

```sh
bun run rig:report ~/atom-rig/runs/<timestamp>
```

The report prints, per step and per replica, the busiest thread (the hot customer's owner): its busy share, heap, every thread's busy share, and each stage's share of its busy time. That is the comparison against staging's stage shares.

## 4b. Rolling deploy (`rig:roll`)

```sh
ulimit -n 65536 && RIG_OVERRIDES='{"stub":{"pushVia":"queue"}}' bun run rig:roll --replicas $A,$B
bun run rig:rollreport ~/atom-rig/runs/roll-<timestamp>
```

Steady load on both replicas (`roll.deductionsPerSec`, flat, no hot customer), then each replica in `roll.order` is
swapped as Alien swaps a container, each step at the offset measured on dep_tco9 (2026-10-13): new requests stop
going to it (the ALB deregistration) → 12 s → SIGTERM → it exits when its drain is done → 12 s → its peer's peers file
drops it (atom.svc after `Replica stopped`) → 10 s → it restarts on the same data dir and the peer lists it again at
once (atom.svc lists a container at start) → `/health` 200 → 15 s → requests go to both again, and the next swap starts.

`roll.jsonl` has one line per second with, per owner class (whose customer the request was about, by the Atom's own
ring), sent / answered / allowed / forwarded by reason / failed by status / proxied, plus every swap event as a mark.
`summary.json` has P1: every deduction a client saw allowed was applied once at the stub, under its Idempotency-Key, and
nothing else was (lost, doubled, unexpected, ambiguous = the client saw a failure). The stub applies hand-ins behind a
per-(writerId, seq) watermark, as Autumn's worker does, so a journal re-sent after a restart counts once.

## 5. Changing the experiment: config only

Every knob is in `tests/bench/rig/rigConfig.ts`: threads, Bun JSC flags, keep-alive, the mix, the steps, the background shape (`flat`, or `snapshot300s`, which ramps to the peak at T+90 s), and the deduction route (send_event check or `/v1/track`).

For a one-off, set `RIG_OVERRIDES` as JSON, deep-merged with arrays replaced. Set replica-side keys (`replica.*`) on the replica boxes and traffic keys on the driver. For example:

```sh
RIG_OVERRIDES='{"replica":{"threads":2,"bunJscFlags":{"BUN_JSC_useConcurrentJIT":"0"}}}' bun run rig:replica ...
RIG_OVERRIDES='{"hot":{"steps":[20,40,60]},"background":{"shape":"snapshot300s"}}' bun run rig:driver --replicas $A,$B
```

## Assumptions to confirm against the shadow (ATMN-1023)

- **Mode:** the replicas run `ATOM_MODE=multi_tenant`, as the shadow's release does, and requests carry the tenant's `x-atom-token`.
- **Pushes:** pushes arrive over HTTP `subjects.set`, not an SQS push queue. With no `ALIEN_PUSHES_BINDING` set, no thread receives from a queue.
- **Env:** `NODE_ENV=production`, `ATOM_THREADS=3`, `ATOM_SLOT_COUNT=128`. Anything else the release sets goes in `replica.extraEnv`.
- **Smoke test:** I ran the rig end to end only in a 2-core sandbox, with both replicas in network namespaces and the driver on the same box. The numbers there are not meaningful; that run only proved the mechanics: registration, seeding, relays, tracks.append, pushes, steps and health. The real numbers come from the three boxes.
