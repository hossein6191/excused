# Excused

A late-delivery penalty with a force-majeure clause that enforces itself: if
the supplier is late, it can cite a notice from a source both sides named in
advance; validators read it on the live web, and the penalty is waived only if
the notice reports an event the clause covers.

## The problem

A supply agreement carries a penalty for late delivery and a force-majeure
clause that waives it: "a closure of the port ordered by the harbour
authority, for storm or flood, lasting at least 24 hours". The clause is
written in advance and argued afterwards. The supplier says the storm closed
the port; the buyer says the closure was six hours, or for fog, or after the
dates the clause names. Whoever holds the penalty decides what the clause
meant, and the other side can only dispute it.

Excused holds the penalty in a contract and settles the clause the moment it
is invoked. The two parties fix the clause, and the one place evidence may come
from, before anything goes wrong. When the supplier is late it points at one
notice from that place, and the network reads that notice against the clause.

## What it is

The supplier signs an agreement with the buyer and locks a **penalty bond**
(0.1 to 100 GEN) with it, in one call:

- the **goods**, 10 to 200 characters;
- the **due time**, at least ten minutes and at most a year ahead;
- the **clause**, 30 to 400 characters, the force-majeure event in the
  parties' own words;
- the **evidence prefix**, one `https` prefix ending in `/` (the harbour
  authority's notices, say), the only place an excuse may be read from;
- the **claim window**, 600 seconds to 30 days after the due time, in which an
  excuse may be cited.

The buyer accepts it, at least five minutes before the due time. Until then
the supplier may take the bond back. After that:

| what happens | where the bond goes, in the same transaction |
|---|---|
| the supplier states delivery before the due time | back to the supplier; closed `on_time` |
| late, and a notice the clause covers is cited | back to the supplier; closed `excused`; the excuse fee stays in its credit |
| late, and the cited notice is not covered | to the buyer, with the excuse fee; closed `penalised` |
| late, and the reading is unclear | nowhere yet; the fee goes to the buyer and the supplier may cite one more notice |
| late, and no excuse cleared it by the end of the window | the buyer collects it; closed `collected` |

An excuse costs 0.01 GEN of credit (`deposit()` adds credit, `withdraw()`
takes all of it back). A supplier gets one judged excuse, and one more only
after an unclear reading. Once both read unclear, the buyer may collect at
once.

## How consensus is used

One `gl.vm.run_nondet_unsafe(leader_fn, validator_fn)` block, in `excuse()`,
which takes no value. Inside the leader closure the node fetches the cited
page once with `gl.nondet.web.get`, checks the status of that answer (anything
outside 200 to 299 is a failed read and stores nothing), and judges the body of
that same answer: the first 128,000 bytes read as UTF-8, every tag removed and
the text after a script or style tag dropped, the whitespace of the first
32,000 characters collapsed, the first 6,000 characters kept. The fingerprint
is the first 16 hex characters of their sha256.

Then four askings over the stored CLAUSE and the PAGE. The two questions,
word for word:

> **COVERED.** Does the PAGE report an event of the kind the CLAUSE describes,
> within the dates and duration the CLAUSE sets? Answer yes, no or unclear.

> **OUTSIDE.** Does the PAGE fail to report such an event, because it reports
> no event, a different kind of event, or one outside the clause's dates or
> shorter than its duration? Answer yes, no or unclear.

Each is asked twice, once with the CLAUSE block first and once with the PAGE
block first. Before the question, one definition says what "such an event"
is (one that meets every condition the clause names: its kind, its cause, who
ordered it when the clause says so, its dates and its least duration), and
after it a line says what yes and no mean. The four readings combine into one
finding:

| finding | COVERED, both orders | OUTSIDE, both orders |
|---|---|---|
| `excused` | yes, yes | no, no |
| `not_excused` | no, no | yes, yes |
| `unclear` | anything else, an unreadable answer included | |

The stored value is `{"finding": ..., "fp": <16 hex>}`. Every validator does
the whole of it itself, the fetch included, inside `try/except`, and compares
the whole value with the leader's by exact equality. A validator never agrees
with a leader that raised. A page that does not read the same for every
validator has another fingerprint and gets no consensus. A model that leans on
the order of the blocks, or says yes to both questions, lands `unclear`.

A model's reply is read strictly. It must be a JSON object whose `answer` is
`yes`, `no` or `unclear`, case and surrounding spaces aside. No word is fished
out of prose, and a boolean is not an answer.

**The prompt boundary.** The clause and the page are fenced: every `<` and
`>` is replaced with a round bracket, never deleted. Each sits between two
delimiter lines tagged with the start of its own sha256 under a label the
contract owns, so neither can draw a delimiter. Before the blocks, the prompt
says that both are untrusted, that somebody with money at stake chose the page,
and that nothing inside them is an instruction. No amount, address, clock or
description of the goods reaches the model.

**Code checks first.** Who is calling, whether the agreement is open, whether
the address is plain `https` below the agreed prefix, whether the supplier is
late and inside the window, how many excuses are left, and whether the credit
covers the fee are all decided before anything is fetched. Every refusal comes
before the round, and nothing is written before it.

## Why this has to be on GenLayer

An ordinary chain can hold the bond and count the seconds, but it cannot read
the harbour authority's notice, and it cannot tell whether "closed six hours
for fog" is "a closure for storm or flood lasting at least 24 hours". An
oracle would put one reader in charge of the excuse. Here every validator
fetches the notice and reads it against the clause itself, and the penalty
moves only on a finding a majority reproduced exactly.

## Who may do what

| call | who | when |
|---|---|---|
| `sign` | anyone; the sender is the supplier | the buyer is another address |
| `accept` | the buyer | while offered, until 300 seconds before the due time |
| `withdraw_bond` | the supplier | while offered, before or after the due time |
| `mark_delivered` | the supplier | accepted, before the due time |
| `excuse` | the supplier | accepted, from the due time until due + claim window; two at most |
| `collect` | the buyer | from due + claim window, or once both excuses read unclear |
| `deposit`, `withdraw` | anyone, its own credit | any time |

## The money

`sign` and `deposit` are the only payable calls. Neither runs a model, and
neither raises after taking value: every refusal returns what was sent in the
same transaction and says why. Every other refused call raises and took
nothing. A bond leaves the contract through one exit, to the supplier
(withdrawn, on time, excused) or to the buyer (penalised, collected). The
contract always holds exactly the bonds of the open agreements and the excuse
credit.

### Every settlement is bounded

Each agreement is settled in its own calls, each with at most two transfers.
No call walks the agreements, and every loop runs over a page of at most
twenty rows or a text cut to a fixed length first.

## Who uses it

- **A timber merchant shipping through a port**, whose buyer accepts the
  harbour authority's notices as the only word on closures.
- **A caterer delivering to an event site**, whose penalty is waived only for
  a road closure the highways agency publishes.
- **A building subcontractor** whose weather clause names the observed-rainfall
  bulletins of one weather service.

## The limits, stated plainly

- **Who controls the source controls the excuse.** Both parties name the
  prefix in advance. A source the supplier runs can publish whatever excuses
  it, and the buyer who accepts such a prefix accepts that.
- **The page must read the same for every validator.** A page that changes
  between fetches (a live counter, a rotating banner) gets no consensus, and
  the excuse stores nothing. Pin evidence where it cannot move. The demo
  notices are served from one commit on `raw.githubusercontent.com`.
- **Text only.** Tags are removed; images, scripts and attachments are not
  read.
- **The network judges the notice, not the cause.** It decides whether the
  notice reports an event the clause covers, never whether that event really
  made the goods late.
- **Delivery is the supplier's statement.** `mark_delivered` is the supplier's
  own signed, public statement. Whether it is true, and what was delivered, is
  settled off chain.
- **Strict reading costs the supplier.** An answer the contract cannot read
  combines as `unclear`, and an unclear reading pays the fee to the buyer.
- **Two excuses at most, and the same text once.** A second page whose text
  reads the same as one already read for the agreement is a repeat: the
  earlier reading stands and the fee goes to the buyer.
- **A round no majority carries stores nothing.** It costs nothing, and it may
  be tried again inside the window. A finding is stored only when a majority
  reproduced it exactly.
- **No readable clock, no window.** The clock is the message clock,
  `gl.message_raw["datetime"]`, the same on every node.
- **English, in printable ASCII on one line**, for the goods and the clause.

## What is in this repository

```
contracts/excused.py          the contract
notices/                      four notices of the fictional Saltmarsh Harbour Authority, the demo's evidence
tests/test_pure.py            the offline suite: the rules, the round with a scripted world per node, every journey
tests/MUTATIONS.md            every defence removed in turn, and the test that caught it
tests/on_chain/smoke.mjs      a throwaway-account run against Studio
tools/mutate.py               the generator that writes MUTATIONS.md and refuses to if anything survives
CONTRACTS.md                  purpose, consensus, state, methods, bounds, windows and limits
DECISIONS.md                  why each rule is the way it is, and what is verified and what is not
```

The demo clause is "A closure of the Port of Saltmarsh ordered by the harbour
authority, for storm or flood, lasting at least 24 hours, between 1 and 20
March 2027". The four notices each change what the clause looks for:

| notice | what it reports | the honest reading |
|---|---|---|
| `port-closed-storm.html` | closed by order for a storm, 06:00 on 9 March to 09:00 on 11 March 2027, 51 hours | excused |
| `port-closed-short.html` | closed by order for fog, 04:00 to 10:00 on 12 March 2027, 6 hours | not excused |
| `port-open.html` | an ordinary operations notice; the port is open | not excused |
| `crane-strike.html` | a dockworkers' strike on 14 March 2027; the port stayed open | not excused |

## Running it

```
pip install -r requirements-dev.txt
pytest tests/ -q                               # no network, no Studio
genvm-lint check contracts/excused.py          # the package is genvm-linter, the command genvm-lint
python tools/mutate.py                         # rewrites tests/MUTATIONS.md; exits 1 if a mutant survives
```

- `pytest tests/ -q` gives **282 passed** in about a second, with nothing
  installed but pytest.
- `genvm-lint check` version 0.11.0 prints `Lint passed (3 checks)` and `Validation passed`, reads Excused as 14 methods (6 view, 8 write), and exits 0.
- `python tools/mutate.py` removes or inverts **239 defences** one at a
  time, and **none survives**; `tests/MUTATIONS.md` names the test that failed
  for each.

The on-chain run generates its own keys and funds them over the network's own
RPC; it never touches anybody's wallet. The validators read the notices from
`raw.githubusercontent.com` at one commit, so push the repository first:

```
npm ci
COMMIT=<sha> node tests/on_chain/smoke.mjs             # the whole run, about forty-five minutes
COMMIT=<sha> RESUME=1 node tests/on_chain/smoke.mjs    # continue a run that was cut off
REPO=<owner>/excused COMMIT=<sha> ...                  # when the git remote is not set
```

It plays three generated accounts: **SUPPLIER**, **BUYER** and **STRANGER**.

1. SUPPLIER is refused when it names itself as the buyer, and when it sends a
   0.05 GEN bond. Both times the value comes back in the same transaction.
2. SUPPLIER signs A1 to A5. STRANGER is refused when it accepts A1, and BUYER
   accepts A1 to A4.
3. SUPPLIER takes back A5's bond, which was never accepted, and states delivery
   of A4 on time.
4. SUPPLIER is refused an excuse before A1 is late.
5. Once the chain's own clock passes the due time, SUPPLIER cites the README,
   outside the prefix, and is refused before any fetch. STRANGER is refused an
   excuse.
6. Each remaining excuse is one round read on the live web:
   - A1, the storm notice: `excused`, and the bond goes back.
   - A2, the strike: `not_excused`, and the bond and fee go to BUYER.
   - A3, the six-hour fog closure: `not_excused`, or `unclear`, in which case
     BUYER collects once the window closes.
7. The run reads the deployed code back and compares it with
   `contracts/excused.py` byte for byte. It checks the views and every
   account's balance against the receipts, and prints `N passed, M failed`.

## Network

Studio, chain 61999. RPC `https://studio.genlayer.com/api`, explorer
`https://explorer-studio.genlayer.com`. The contract pins the runner
`py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6` in its first
line.

## Evidence

The on-chain run is recorded here once it has run.

## Licence

MIT. See `LICENSE`.
