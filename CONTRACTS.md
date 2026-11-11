# Contracts

One file. `contracts/excused.py`, class `Excused`, is the contract.

## Excused

### Purpose

A late-delivery penalty whose force-majeure clause enforces itself. A
supplier locks a penalty bond for a buyer, together with the goods, the due
time, a force-majeure clause in the parties' own words, the one `https` prefix
evidence may come from, and a claim window after the due time. The buyer
accepts it. A supplier who states delivery before the due time takes the bond
back. A late supplier may cite one notice below the prefix. The network reads
that notice against the clause, and the bond moves in the same call: back to
the supplier if the notice reports an event the clause covers, to the buyer if
it does not. A late agreement that no excuse clears goes to the buyer when the
window closes.

### Consensus

There is one round, `_judge(clause, url)`, run only in `excuse()`, which takes
no value. It is one `gl.vm.run_nondet_unsafe(leader_fn, validator_fn)` block.
In its leader closure there is one `gl.nondet.web.get(url)` and four
sequential `gl.nondet.exec_prompt(..., response_format="json")` calls, and
there are no others in the file. Nothing is nested.

The leader closure works in three steps.

1. **The fetch.** Any failure, or a status outside 200 to 299, raises
   `[TRANSIENT]`.
2. **The page.** The body of that same answer is read by
   `_page_text(_visible(_decoded(body)))`:
   - the first `MAX_RAW_BYTES` (128,000) bytes are decoded as UTF-8,
     replacing bad bytes;
   - every tag becomes a space, and the text after a `script` or `style` tag
     is dropped;
   - the whitespace of the first `MAX_RAW_PAGE` (32,000) characters is
     collapsed;
   - the first `MAX_PAGE_TEXT` (6,000) characters are kept.

   A page that reads as nothing raises `[TRANSIENT]`. The fingerprint is
   `sha256(page)[:16]`.
3. **The askings.** Four askings, built by `_task(clause, page, order,
   question, meaning)`:

| asking | question | blocks |
|---|---|---|
| 1 | `QUESTION_COVERED` + `MEANING_COVERED` | CLAUSE, then PAGE |
| 2 | `QUESTION_COVERED` + `MEANING_COVERED` | PAGE, then CLAUSE |
| 3 | `QUESTION_OUTSIDE` + `MEANING_OUTSIDE` | CLAUSE, then PAGE |
| 4 | `QUESTION_OUTSIDE` + `MEANING_OUTSIDE` | PAGE, then CLAUSE |

A model failure raises `[LLM_ERROR]`. Every prompt is laid out in the same
order:

- `HEADER`, `UNTRUSTED` and `EITHER_ORDER`;
- the two blocks;
- `READING`, how the page was cut, and that a forecast or warning is not a
  report;
- `SUCH_EVENT`, the one definition both questions refer to;
- the question, what yes and no mean, and `RETURN_WORD`.

The two framings differ only in the question and its meaning.

`_read_word(raw)` reads a reply as `yes`, `no` or `unclear`, or `""`. It
accepts only a JSON object, given as an object or as the text of one, at most
`MAX_REPLY` characters, whose `answer` is a string equal to one of the three
words after `strip().lower()`. Fractions in other keys stay text, and NaN
makes the reply unreadable. `_combine(covered_a, covered_b, outside_a,
outside_b)` returns `excused` only for yes, yes, no, no; `not_excused` only for
no, no, yes, yes; and `unclear` for anything else.

The leader returns `{"finding": ..., "fp": ...}`. The validator is one line,
`return _agrees(leaders_res, leader_fn)`. `_agrees` checks three things:

- it refuses anything that is not a `gl.vm.Return` holding a dict;
- it reruns `leader_fn` inside `try/except`, so its own failure is a
  disagreement;
- it compares the whole value by `==`.

`_clean_value` reads the agreed value back. A finding outside the three
words, or a fingerprint that is not 16 lower-case hex characters, reads as
`unclear`.

### State

`Agreement` (scalars only):

| field | what it holds |
|---|---|
| `supplier`, `buyer` | the two parties |
| `goods`, `clause`, `source_prefix` | the terms |
| `bond` | the penalty bond |
| `due`, `claim_window` | the due time, and the seconds after it in which an excuse may be cited |
| `signed_at`, `accepted_at` | when it was signed and accepted |
| `status` | `offered`, `active`, `on_time`, `excused`, `penalised`, `collected` or `withdrawn` |
| `excuses` | excuses read so far, 0 to 2 |
| `last_finding` | the finding of the last excuse |
| `closed_at`, `closed_by` | when it closed, and the excuse that closed it |
| `to_supplier`, `to_buyer`, `fees_to_buyer` | what it has paid out |

`Excuse` (scalars only):

| field | what it holds |
|---|---|
| `agreement_id`, `supplier`, `url` | which agreement, who cited, which page |
| `n` | 1 or 2 |
| `finding`, `fp` | what the network found, and the page's fingerprint |
| `repeat_of` | the earlier excuse whose text this was, or `""` |
| `fee_to` | `supplier` (kept) or `buyer` |
| `at` | when it was read |

The contract's own storage:

| map or field | what it holds |
|---|---|
| `agreement_rows`, `excuse_rows` | `A1`… and `X1`… |
| `index`, `counts` | numbered lists: `party:<address>` (every agreement an address is a party to) and `excuses:<agreement>` |
| `seen` | `<agreement>\|<fp>`, the excuse that first read that text |
| `balances` | excuse credit per address |
| scalar totals | `held_total`, `bonds_total`, `to_suppliers`, `to_buyers`, `credit_total`, `deposited_total`, `credit_out`, `fees_total`, `returned`, and one counter per outcome |

### Key methods

| method | kind | what it does |
|---|---|---|
| `sign(buyer, goods, due, clause, source_prefix, claim_window)` | payable | the value is the bond; every refusal returns it; no model |
| `accept(agreement_id)` | write | the buyer, while offered, until `due - ACCEPT_MARGIN` |
| `withdraw_bond(agreement_id)` | write | the supplier, while offered: the bond back |
| `mark_delivered(agreement_id)` | write | the supplier, accepted, before `due`: the bond back, `on_time` |
| `deposit()` | payable | adds the value to the sender's credit |
| `withdraw()` | write | pays the sender all of its credit |
| `excuse(agreement_id, url)` | write | the supplier, late, inside the window: one round, and the money in the same call |
| `collect(agreement_id)` | write | the buyer, from `due + claim_window`, or once both excuses read unclear |
| `agreement(agreement_id)` | view | one agreement, its phase on this read's clock, and `now` |
| `agreements_of(address, offset, limit)` | view | a page of at most 20 agreements of one address, with its role |
| `excuses_of(agreement_id, offset, limit)` | view | a page of at most 20 excuses of one agreement |
| `credit(address)`, `stats()`, `rules()` | view | credit; totals; the questions, combine table, money table and limits in the contract's own words |

### Bounds

| bound | value |
|---|---|
| bond | 0.1 to 100 GEN |
| goods | 10 to 200 characters |
| clause | 30 to 400 characters |
| evidence prefix | at most 120 characters |
| cited address | at most 200 characters |
| due time | 600 seconds to 365 days after signing |
| claim window | 600 seconds to 30 days |
| excuses per agreement | 2 |
| excuse fee | 0.01 GEN |
| a model's reply | at most 2,000 characters are parsed |
| page | 128,000 bytes decoded, 32,000 characters collapsed, 6,000 judged |
| list views | at most 20 rows per read |
| view arguments | ids are read to 16 characters, addresses to 42 |
| the longest prompt | under 12,000 characters |

### Windows

| window | from | until |
|---|---|---|
| accept | signing | `due - 300` |
| withdraw_bond | signing, while offered | no end |
| mark_delivered | acceptance | `due` |
| excuse | `due` | `due + claim_window` |
| collect | `due + claim_window`, or the second unclear reading | no end |

### Limits

- **Who controls the source controls the excuse.** The evidence source is
  named in advance by both parties.
- **The page must read the same for every validator.** Text only.
- **The notice, not the cause.** The network judges whether the notice
  reports an event the clause covers, never whether that event caused the
  lateness.
- **Delivery is the supplier's signed statement.** Disputes about it are
  settled off chain.
