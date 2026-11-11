# Decisions

The boundary first, then the two questions, the prompt, the page, the money,
the second excuse, why every call is bounded, the doors, the views, the
self-audit, then what is verified and what is not.

## 1. The boundary: what the network agrees on

**A finding and a fingerprint.** The round stores `excused`, `not_excused` or
`unclear`, three words the contract wrote, and the first 16 hex characters of
the sha256 of the text it judged. What has to be decided is whether one notice
reports an event one clause covers. A yes or a no is the coarsest answer that
carries it. A score, a summary of the notice or a list of the clause's
conditions met would put values in storage that honest nodes could reach
differently while believing the same thing. The fingerprint makes the page
itself part of the agreed value: two validators who read different bytes
cannot agree.

**What a program can check, the program checks.** The code decides, before
any page is fetched:

- who is calling, and whether the agreement is accepted and still open;
- whether the supplier is late and still inside the window;
- whether the address is plain `https`, below the prefix both parties named;
- how many excuses are left, and whether the credit covers the fee.

The network is asked only what code cannot answer: does this notice, in its
own words, report an event of the kind the clause describes, within its dates
and duration.

**It never sees money or people.** `_judge` takes the clause and the address,
and nothing else: no bond, no address of either party, no clock, no goods. The
model reads two texts.

**It does not judge cause or delivery.** The network is never asked whether
the storm made the goods late, nor whether the goods arrived. The first is
what the clause is for: the parties agreed in advance that a covered event is
excuse enough. The second is the supplier's own signed statement, settled off
chain if it is false.

## 2. Two questions, both orders, one block

**Two framings that check each other.** COVERED asks whether the page reports
a covered event; OUTSIDE asks whether it fails to, and lists the ways it can
fail (no event, another kind, outside the dates, shorter than the duration).
An honest reader answers them opposite ways. A model that says yes to
everything, or no to everything, lands `unclear`, never on one side.

**Both orders, because position bias is invisible to consensus.** Every
validator builds the same prompt and leans the same way, so a bias towards the
first block would be agreed on unanimously. Asking each question with the
clause first and with the page first, inside the same block, puts any lean in
the stored value: a model led by the order reads `unclear`. A test drives the
round with exactly such a model.

**Disagreement is a value, never a tolerance.** The combine rule is exact:
four readings in one pattern for `excused`, the mirror pattern for
`not_excused`, and everything else `unclear`. The validators compare the whole
stored value by equality. Nothing is rounded, forgiven or majority-voted
inside a node.

**Strict reading.** A reply counts only as a JSON object whose `answer` is
one of the three words, case and surrounding spaces aside. Fishing a word out
of prose, or cutting an object out of surrounding text, would read different
replies as the same answer. A node whose model rambles reads `unclear`, and
the other nodes do not then agree with a leader who read `excused`.

## 3. The prompt

**One definition, so each question asks one thing.** Both questions refer to
"such an event", and `SUCH_EVENT` says once, before either question, what that
is: one that meets every condition the clause names, its kind, its cause, who
ordered it, its dates and its least duration. The questions themselves are the
parties' words, word for word, published by `rules()`.

**A forecast is not a report.** `READING` says that a warning of a storm is
not a report that one happened, because a harbour authority publishes both.

**Fenced, tagged, declared.** Fencing covers the clause, which the parties
wrote, and the page, which whoever runs the source wrote and the supplier
chose. Every `<` and `>` in them becomes a round bracket, replaced and never
deleted, so a cap can never be pushed back over. Each block sits between two
lines tagged with the start of its own sha256, under a label from a closed set
(anything else prints as `BLOCK`). The delimiter is written in one place.
Before the blocks the prompt says both are untrusted and never an instruction,
and a static test checks that every value joined into a prompt is fenced or a
contract constant.

## 4. The page

**One request, and its own body.** The node fetches once, reads the status of
that answer and judges the body of that same answer. A second request (a
render, a head) could meet another server. A status outside 2xx is a failed
read, never a notice judged not to excuse.

**Cut before it is walked.** The body is cut in bytes before it is decoded,
in characters before its tags are split out, and again before its spacing is
collapsed, so no work grows with a page somebody chose. The text after a
script or style tag is dropped because it is code, not words a reader sees.

**A failed read stores nothing.** A fetch that fails, a status outside 2xx,
a page that reads as nothing and a model call that fails each raise inside the
leader. A validator never agrees with a leader that raised, so nothing is
written, no fee is taken, and the supplier may cite the notice again inside the
window.

**Pinned evidence.** The demo prefix is one commit's `notices/` on
`raw.githubusercontent.com`, so every validator reads the same bytes for good.
A live authority's site would serve the same notice to everybody only while it
is not edited. A notice edited after it was read has another fingerprint and
is read afresh.

## 5. The money

**The bond is the value of `sign`.** A supplier commits by paying. `sign` runs
no model and never raises after taking value: every refusal returns the whole
value in the same transaction and says why. A test drives every refusal and
checks that nothing else was written.

**The money moves in the call that decides it.** An excuse that reads
`excused` sends the bond back and leaves the fee in the supplier's credit; one
that reads `not_excused` sends the bond and the fee to the buyer. There is no
second step for anybody to forget or to block.

**Every state has a way out.** An agreement never accepted is the supplier's
to take back, before or after its due time. An accepted one is closed by an
on-time statement, by an excuse, or by the buyer's collect once the window has
closed. A round the network never agrees on stores nothing, so it cannot hold
the bond: the window runs out and the buyer collects. Credit is always the
sender's to withdraw.

**The buyer accepts before the margin.** The buyer must accept at least 300
seconds before the due time. A buyer who accepted in the last second would
leave a supplier who had already delivered no time to say so, and the bond
would fall to the buyer.

## 6. The second excuse and the same text once

**One more after an unclear reading.** An unclear reading has not decided the
question, and the supplier may have cited a poor notice from the right source.
It gets one more, and only one: `MAX_EXCUSES` is 2. The unclear reading's fee
goes to the buyer, so the extra excuse is never free.

**The same text is read once.** A text the network read for an agreement is
remembered by its fingerprint, and a second page whose text reads the same,
under any address, is a repeat. The earlier reading stands and the fee goes to
the buyer. Otherwise the second excuse would be a second roll of the same
page.

**The buyer collects at once when nothing is left.** After two unclear
readings nothing can clear the agreement. Making the buyer wait out the window
would hold the bond for nothing, so collect opens then.

**A round no majority carries.** It stores nothing and costs nothing, and the
supplier may send it again inside the window. That is a retry of consensus,
not of a finding: a finding is stored only when a majority reproduced it
exactly.

## 7. Why every call is bounded

Each agreement is settled in its own calls, each with at most two transfers.
No call walks the agreements. Every loop runs over one of the following, and a
static test lists every loop with its bound:

- a page of at most `PAGE` (20) rows;
- the five URL signs;
- the forty hex digits of an address;
- the sixteen characters of a fingerprint;
- the pieces of a page cut to `MAX_RAW_PAGE` first.

Party and excuse lists are numbered slots, appended in O(1). They have no cap
for a stranger to fill. A stranger may sign agreements that name somebody as
buyer, at 0.1 GEN of bond each, and those only lengthen a paged list.

## 8. The doors

- **Text.** The goods and the clause are printable ASCII on one line. A
  clause can never start a line of the prompt the contract writes. The length
  as sent is capped before it is trimmed or walked.
- **Addresses.** An address is `0x` and 40 hex digits, not zero, in either
  case. The buyer is never the supplier and never this contract.
- **URLs.** A URL is `https`, a lowercase host with a dot, and letters,
  digits and `- . _ ~ /` only: no query, fragment, port, percent sign, empty
  segment, `.` or `..`. One page has one spelling, and no path climbs out of
  the prefix. The prefix ends in `/`, and a cited page is strictly below it.
- **Numbers.** A number argument is an int, or a string of at most 40 ASCII
  digits; a bool is refused.
- **JSON.** Every `json.loads` uses hooks that never build a float.

## 9. Views

The views take only an id, an address, an offset and a limit. An id is read
to 16 characters and an address to 42, and lists return at most 20 rows.
`agreement()` reports the message clock it was read at as `now` (`-1` when the
read carries none), so the on-chain run waits by the chain's own clock.

## 10. The self-audit

The finished contract was read once against every reason a past submission
was rejected:

- unbounded loops;
- missing sender checks;
- a payable that runs a model or raises after taking value;
- money stuck without a default;
- values not re-derived, or compared with a tolerance;
- one order or one framing only;
- compound questions;
- lenient parsing;
- unfenced untrusted text;
- free re-rolls;
- caps a stranger can fill;
- long view arguments;
- a missing deployed-code check.

Each is pinned by a test: a static check over the parsed source, or a journey
through the calls.

One real defect was found, in the on-chain run rather than the contract.
`untilPast`, which waits by the chain's clock, read a failed view as an
instant of 0 and stopped waiting. It would have sent an excuse before the due
time, and the check would have failed. It now reads again after a failed
read, and
`TestNotices::test_the_smokes_clock_wait_never_ends_on_a_failed_read` checks
that it does.

The mutation run found two escapes. A negative number was tested only with
-1, which is also the refusal value; the suite now tests -5. One mutant could
never be reached, because a reply that fails to parse never reaches that
branch; it was replaced by one that can (a JSON string reply read as the
answer), and the suite now refuses that reply.

## 11. Verified, and not verified

**Verified here, offline, with no network:** 282 tests, green. The round
is driven with a scripted world per node: its own fetch and its own model. The
cases include:

- the full 256-row combine table;
- every asking counting in its own place;
- a model led by the order of the blocks;
- a model that misreads, one validator outvoted, and a validator reading an
  edited copy of the page;
- a validator whose own rerun raises, and a leader whose fetch, status, body
  or model failed (none of them stored);
- strict reading of 30 reply shapes;
- every refusal of every call, with nothing written;
- each finding and its money, an unclear reading and the second excuse, a
  repeat of the same text, collect, on-time delivery and both withdraw paths;
- forty seeded random journeys with the books checked after every step.

239 defences were removed or inverted one at a time, none surviving,
each with the test that caught it named in `tests/MUTATIONS.md`.
`genvm-lint` 0.11.0 passes with exit code 0.

**Verified by construction, through static checks over the parsed source:**

- the web and the model are reached only inside the one leader closure: one
  fetch, and four askings pairing both framings with both orders;
- the round is not nested and runs only in `excuse`, after every refusal and
  before every write;
- the validator is one line delegating to the comparison, which refuses a
  leader error and compares by exact equality;
- every write either refuses by sender or is listed with its reason (`sign`,
  `deposit`, `withdraw`);
- the payable writes reach no raise and no model;
- every value joined into a prompt is fenced or a contract constant;
- every `json.loads` refuses floats, and there is no float, no true division
  and no `datetime`;
- every loop is bounded by a named constant;
- every transfer goes through the transfer interface from named exits;
- storage holds scalars only, and views take only short arguments;
- the smoke carries the suite's clause and goods byte for byte and compares
  the deployed code with the file;
- the file pins the runner in its first line;
- no personal or internal detail appears anywhere in the repository.

**Verified on chain:** not yet. The on-chain run is recorded in the README
once it has run.

**Not verified:** how a live model reads the four notices. That includes
whether it reads the 51-hour storm closure as covered in both orders and both
framings (the honest answer is yes: ordered by the authority, for storm,
51 hours, 9 to 11 March 2027). It also includes whether it reads the six-hour
fog closure as not covered or as unclear; the smoke accepts either and settles
both. How often a borderline notice splits across the four askings, and which
model the validators run, are not verified either.
