# Tarok: Rules

This document replaces `Rules.txt` and `RULES-DECISIONS.md`. It is the single source of truth for
the rules the engine implements, the in-app rules notebook and the PDF. Where it differs from the
original text, this document wins. Section 12 lists the points that are still assumptions.

Tarok here is a variant based on Slovenian Tarok.

## 0. Terminology

Game terms (Rufer, Dreier, Bettel, Talon, Pagat, Mond, Szkis, ...) stay as written in the source.

| Term | Meaning |
|---|---|
| Round | One deal, 12 tricks (the original text calls this a "game"). |
| Match | A sequence of rounds with a win condition. |
| Trick | The four cards laid one by one (the original "tura"). |
| Leader | The player who leads a trick: the previous trick's winner, or the declarer in trick 1. (The original text also calls this "declarer"; this document uses "leader" for the role.) |
| Declarer | The player who won the bidding. |
| Starting player | The player who speaks first in bidding. Also known as "Na Musiku". The role passes to the player on the left every round. |
| Side | Declarer side against defender side. In 2v2 contracts the called king's holder joins the declarer side once revealed. |
| Pile | The cards a side has won. A side's pile is counted as a whole. |
| Bot | Takes the place of a regular player. |
| Dummy | An extra hand controlled by a regular player or a bot. A dummy is not a bot. |

Card letters in the original: W = Jack, J = Rider (Knight), D = Queen, K = King.

---

## 1. Cheat sheet

### 1.1 Cards

Order within suits (high to low):

| Rank | Black (Spades, Clubs) | Red (Hearts, Diamonds) |
|---|---|---|
| 1 | King | King |
| 2 | Queen | Queen |
| 3 | Rider | Rider |
| 4 | Jack | Jack |
| 5 | 10 | 1 |
| 6 | 9 | 2 |
| 7 | 8 | 3 |
| 8 | 7 | 4 |

Tarocks: a higher number beats a lower one. The Szkis is tarock 22. Exception: if tarocks 1, 21 and 22
are all in a trick, the 1 (Pagat) wins.

Card points: pip cards 1, Jack 2, Rider 3, Queen 4, Kings and tarocks 1, 21, 22 = 5, all other tarocks 1.

### 1.2 Contracts

Positive (the declarer side needs 36 or more of 70 counted points):

| Contract | Value | Summary |
|---|---|---|
| Rufer | 1 | Call a king, take one Talon pile. Only the starting player may bid it. |
| Solo | 2 | Like Rufer, no Talon cards. |
| Besser Rufer | 1 + bonuses | Like Rufer, anyone may bid it, must declare at least one bonus. |
| Dreier | 4 | One pile from the Talon, declarer against the other three. |
| Solodreier | 8 | Dreier without Talon cards. |
| Sechsendreier | 2 (loses 4) | Dreier taking both piles (6 cards). |
| Farbendreier | 3 | Dreier where tarocks do not trump; only bonus is Valat. |
| Farbensolo | 6 | Farbendreier without Talon cards. |

Negative (the declarer must win exactly the given number of tricks, no bonuses):

| Contract | Value | Goal |
|---|---|---|
| Bettel | 3 | 0 tricks |
| Piccolo | 2 | exactly 1 trick |
| Zwiccolo | 2 | exactly 2 tricks |
| Bettel Ouvert | 6 | like Bettel, all hands revealed after trick 1 |
| Piccolo Ouvert | 5 | like Piccolo, all hands revealed after trick 1 |
| Trischaken | n/a | Played only when everyone passes. Everyone plays alone. |

### 1.3 Bonuses

Values are (silent, announced). Only the declarer side may announce.

| Bonus | Condition | Value |
|---|---|---|
| Trull | Finish with Szkis, Pagat and Mond | (1, 2) |
| Vier Könige | Finish with all four kings | (1, 2) |
| Mondfang | Capture the opponents' Mond with the Szkis | (1, 2) |
| Sküsfang | Capture the opponents' Szkis | (2, 4) |
| König Ultimo | Win the last trick with the called king (Rufer, Solo, Besser Rufer) | (1, 2) |
| Pagat Ultimo | Win the last trick with the Pagat | (1, 2) |
| Uhu | Win the second-to-last trick with tarock II | (2, 4) |
| Kakadu | Win the third-from-last trick with tarock III | (3, 6) |
| Marabu | Win the fourth-from-last trick with tarock IV | (4, 8) |
| Valat | Win all tricks | multiplier x4 (x8 announced) |

### 1.4 Contra

Kontra x2 (non-declarers), Rekontra x4 (declarer), Subcontra x8 (non-declarers), Mordkontra x16
(declarer), then the chain ends (a setting can continue it). Rufer, Besser Rufer and Solo cannot be
contra'd at all.

### 1.5 Timers

Card viewing 3 minutes (shared), 20 seconds per decision in licitation, a per-round bank of
20 / 15 / 10 minutes for 2 / 3 / 4 or more players. See section 10.

---

## 2. What is Tarok

Tarok is played with 54 cards: 8 cards from each of Hearts, Diamonds, Clubs and Spades, and 22 tarocks
forming a fifth suit. The goal is to score as many points as possible by winning individual rounds.
The rules follow Slovenian Tarok.

---

## 3. Course of play

Each round, four players get 12 cards each and two piles of 3 cards (the **Talon**) are set aside.
Once players have seen their cards (but not the Talon), bidding decides the contract (section 5).
Then, starting with the declarer, players lay cards in tricks until the cards run out or the contract
is decided.

### 3.1 A trick

1. The leader (the declarer in trick 1, otherwise the previous trick's winner) lays any card.
2. The others lay a card in clockwise order, where:
   1. a player must **follow the suit** of the led card;
   2. a player without that suit must lay a **tarock** (not in Farben contracts);
   3. a player with neither lays any card.
3. In **negative contracts** (and Trischaken) a player must also **beat the current winner if
   possible**, among the cards the rules above allow. Playing the highest card is often best but is not
   required. In negative contracts the **Pagat may not be played** unless it is the player's last tarock;
   this is applied first, then must-beat. Both rules apply to all players.
4. There is **no obligation to beat** in positive contracts.
5. The winner is the highest tarock, or (with no tarocks) the highest card of the led suit. In Farben
   contracts tarocks are an ordinary suit: the winner is the highest card of the led suit.
6. The winner collects the trick into their pile and leads the next one.

After 12 tricks, points and bonuses are counted and standings change (section 8).

---

## 4. Cards and points

- Black suits: 7 < 8 < 9 < 10 < Jack < Rider < Queen < King.
- Red suits: 4 < 3 < 2 < 1 < Jack < Rider < Queen < King.
- Tarocks: the higher number takes the lower. Szkis = 22.
- **Pagat exception:** if the Pagat (1), Mond (21) and Szkis (22) are all in one trick, the Pagat wins.
  This does not apply in Farben contracts. No card is therefore a guaranteed winner outside Farben.
- Raw card points total 106. Section 8.1 turns this into 70 counted points.

---

## 5. Bidding and contracts

### 5.1 Raising

- Bidding is clockwise from the starting player. A player may **pass** or bid a contract.
- A bid needs a **strictly higher value** than the current bid. **Exception:** the starting player may
  bid an equal value, including the same contract (a "hold").
- Contracts of equal value (Solo / Sechsendreier / Piccolo / Zwiccolo at 2, Bettel / Farbendreier at 3,
  Bettel Ouvert / Farbensolo at 6, ...) do not outbid each other except through the starting player's hold.
- **Dummies always pass.**
- Besser Rufer's bid value is 1 plus the announced values of the bonuses declared with the bid
  (Valat is not counted).

### 5.2 Bidding rounds

1. Until someone bids, each player in turn passes or bids. If all pass, the round is **Trischaken**.
2. After a bid by `B`, each of the other three players gets one turn in clockwise order and may pass or
   outbid. **A pass is not final**: players who passed earlier take part again.
3. If someone outbids, they become `B` and step 2 repeats.
4. If all three pass, `B` must **confirm** (bidding ends, `B` is the declarer) or **bid a contract of
   strictly higher value**. `B` cannot use the hold or the Slovenian method against themselves.

### 5.3 Slovenian method

A bid with a lower `take` outbids the same contract at the same value. It works on every positive
contract that takes from the Talon: Rufer, Besser Rufer, Dreier, Sechsendreier, Farbendreier.

- 3-card contracts: the declarer takes 3, 2 or 1 cards of one pile. They still see the whole Talon and
  still choose one pile.
- Sechsendreier: 6 down to 1 cards. The cards **not taken are removed from one pile first**: with
  `L = 6 - take` cards left, `min(L, 3)` come from one pile and only the rest from the other. Examples:
  take 5 leaves 1 card of one pile; take 3 leaves a whole pile; take 1 leaves one whole pile and 2 of the other.
- The cards not taken go to the defenders' pile. The declarer discards as many cards as they took.
- Anyone allowed to bid the contract may use it (so Rufer stays starting-player only). A Besser Rufer bid
  using it must still declare bonuses, with the same total value as the current bid.

### 5.4 Contracts

#### Rufer (1)

Two teams of two. The declarer side wins with 36 or more counted points.

1. After the bid the declarer **names the suit of a king**. Its holder becomes the partner, revealed when
   that king is played.
2. The Talon is revealed to everyone.
3. The declarer picks one pile and takes it; the other pile is turned face down and goes to the defenders.
4. The declarer discards as many cards as they took (section 6.4).

If the called king is in the Talon the declarer may:

- **give up**, losing 3 in the standings (each of the other three gets 1);
- **play alone** at the same value (from then on it plays like Dreier);
- **switch to Dreier** (value 4).

If the declarer holds the called king themselves they play alone. Rufer can only be bid by the starting player.

#### Solo (2)

Like Rufer, but no Talon cards are taken: after being revealed, all six go to the defenders' pile. Anyone may bid it.
Giving up when the called king is in the Talon costs **2 to each of the other three** (declarer -6).

#### Besser Rufer (1 + bonuses)

Like Rufer, but anyone may bid it, and the bidder must declare at least one bonus. Giving up when the
called king is in the Talon costs **4 to each** of the three others (declarer -12).

#### Dreier (4)

The declarer plays against the other three. The Talon is revealed, the declarer takes one pile, the other goes
to the defenders, and the declarer discards as many cards as they took.

#### Solodreier (8)

Like Dreier, but no Talon cards are taken (all six go to the defenders).

#### Sechsendreier (2, 4 on a loss)

Like Dreier but the declarer takes **both piles** (6 cards) and discards 6. Wins +2, loses -4. The Slovenian method
applies (take 6 down to 1).

#### Farbendreier (3) and Farbensolo (6)

Like Dreier and Solodreier, but **tarocks are an ordinary suit** (they do not trump, there is no Pagat exception
and no obligation to play a tarock when a suit cannot be followed). When discarding, the 1-point tarocks
(2 to 20) must be put down first. The only available bonus is Valat.

#### Bettel (3), Piccolo (2), Zwiccolo (2), and the Ouvert forms (6 and 5)

Negative contracts, 1v3, no bonuses (contra is allowed). The Talon stays hidden and unused.

- Bettel: win **no** trick. Piccolo: win **exactly one**. Zwiccolo: win **exactly two**.
- The declarer leads trick 1. A contract is lost the moment the declarer wins more tricks than the target;
  otherwise it is decided after trick 12.
- **Ouvert**: after the first trick all players reveal their cards.
- Must-beat and the Pagat restriction apply (section 3.1).

#### Trischaken

Played only if everyone passes. Everyone plays alone, aiming for the fewest points; no Talon, no bonuses, must-beat
and the Pagat restriction apply, and the starting player leads trick 1. Settlement is in section 8.5.

### 5.5 Summary

- Rufer, Solo, Besser Rufer: 2 vs 2 (called king). Dreier family: 1 vs 3. "Solo" in a name means no Talon cards
  are taken. "Farben" in a name means tarocks do not trump.
- In 2v2 contracts, the value is what each member of the losing team loses and each member of the winning team gains.
  In 1v3 contracts, it is what the declarer receives from each opponent on a win and pays each on a loss. Points only
  move between players, so standings always sum to zero.

---

## 6. After bidding

Order of events once the declarer is known:

1. **Declarations:** the declarer declares bonuses (only the declarer side may announce; opponents cannot). Besser Rufer
   bids already carry their bonuses and may add more. Skipped in negative contracts.
2. **Contra window** (6.2). Skipped for Rufer, Solo, Besser Rufer.
3. **King call** (called-king contracts).
4. **Talon:** revealed (positive contracts), the declarer takes cards, then discards (6.4).
5. **Play** (section 3). The declarer leads.

### 6.1 Which bonuses can be declared

All bonuses are available in Rufer, Solo and Besser Rufer; all except König
Ultimo in Dreier, Solodreier and Sechsendreier; only Valat in Farbendreier and Farbensolo; none in negative contracts
and Trischaken. König Ultimo only exists with a called king.

### 6.2 Contra

- **Rufer, Solo and Besser Rufer cannot be contra'd**, neither the contract nor any bonus declared in them.
  Every other contract can, including negative ones.
- Contra applies **separately** to the contract and to each **declared** bonus (including a declared Valat).
  Silent bonuses cannot be contra'd.
- Chain: **Kontra x2** (only non-declarers), **Rekontra x4** (only the declarer), **Subcontra x8** (non-declarers),
  **Mordkontra x16** (declarer). Then the chain ends. A setting (`infiniteContra`) continues it with the same
  alternation (x32, x64, ...).
- In the window each opponent answers in seat order (raise or "no contra"); after a raise the other side gets a turn;
  the window closes when a full turn passes without a raise.

### 6.3 Called king in the Talon

See Rufer in 5.4. For Solo and Besser Rufer the same three options apply with their own give-up costs. Switching to
Dreier drops declared bonuses that Dreier does not allow.

### 6.4 Discards

A discarded card must be worth **less than 5 points** (no King, no tarock 1, 21 or 22). In Farben contracts the
declarer must discard 1-point tarocks first. Discards go to the declarer side's pile.

---

## 7. Bonuses

Bonuses change the value of the round. Winning one raises the result in the winner's favour; losing one does the opposite.
A declared bonus that is not achieved is lost at the announced value.

### 7.1 Card-collecting bonuses

- **Trull:** the side's final pile holds Szkis, Pagat and Mond.
- **Vier Könige:** the side's final pile holds all four kings.
- **Mondfang:** the Szkis wins a trick containing the opposing side's Mond. **If the Pagat wins the trick, Mondfang
  cannot occur.**
- **Sküsfang:** the opposing side's Szkis is played into a trick it does not win. This is only possible through the
  Pagat exception.

### 7.2 Ultimo bonuses (König Ultimo, Pagat Ultimo, Uhu, Kakadu, Marabu)

The relevant card must win its trick: trick 12 for König Ultimo and Pagat Ultimo, trick 11 for Uhu, trick 10 for
Kakadu, trick 9 for Marabu. **One rule decides loss:** if that card is played in its trick and any other card wins
the trick, the bonus is **lost** by the side of the player who played it. It does not matter which side took the
trick, only whether that card took it. If the card is not played in its trick, nothing happens (unless the bonus
was declared, see section 7).

### 7.3 Valat

Valat (all 12 tricks by one side) is a **multiplier**, applied **last** to the value of the whole play including
contras, contracts, other bonuses and their contras: x4 silent, x8 declared, times its own contra chain if declared.
A **declared Valat that fails** still applies its multiplier, but **the declarer loses the contract**.

---

## 8. Counting and settlement

### 8.1 Pile counting

Each side's pile includes its won tricks, the declarer's discards (declarer side) and any Talon cards handed to the
defenders (defender side). In 2v2 the team's cards are counted together. The pile is counted as: sum the card points
of every triple of cards and subtract 2 from each; if one or two cards are left over, subtract 1 from them. In closed
form:

```
count(pile) = points - 2 * floor(n / 3) - (1 if n mod 3 != 0 else 0)
```

This rewards high-quality cards and makes the two piles always total exactly **70**. A positive contract is won with
**36 or more**.

### 8.2 Settlement formula

Let `Q` be the declarer-side value before Valat:

```
Q = s * base * m_contract + sum over non-Valat bonuses ( d_b * v_b * m_b )
```

- `s = +1` on a win, `-1` on a loss; `base` is the contract's value (loss value on a loss; Sechsendreier: 2 / 4).
- `m` are contra multipliers (1 if none).
- `d_b = +1` if the declarer side earned the bonus, `-1` if the declarer side lost it; the signs flip for the defender
  side's bonuses. `v_b` is the silent or announced value.

Then `P = Q * K`, where `K` is the Valat multiplier (1 if no Valat). If a declared Valat failed, recompute `Q` with the
contract counted as lost, then multiply.

Standings: in 2v2 every declarer-side player gets `+P` and every defender `-P`; in 1v3 the declarer receives `P` from each
opponent. Example: a won Rufer (1) with a lost Uhu (2) gives `1 - 2 = -1`.

### 8.3 Negative contracts

Won: `+value x contra` from each opponent. Lost: `-value x contra` to each opponent. No bonuses.

### 8.4 Giving up and forfeit

Give-up costs are in 5.4 (Rufer -3, Solo -6, Besser Rufer -12 in total). A declarer who forfeits on the clock (section
10.2) is settled as a lost contract: declared bonuses count as lost and a declared Valat as failed.

### 8.5 Trischaken settlement

Each player counts their own pile. Applied cumulatively:

1. A player with **more than 35 points** pays 2 to each other player.
2. Otherwise, if the two highest scorers are **strictly** above the two lowest (2nd place beats 3rd), each of the top two
   pays 1 to each of the bottom two. Otherwise nothing moves.
3. **Independently**, a player who won no trick receives 2 from each other player.

The Talon is ignored.

---

## 9. Other numbers of players

Tarok is for four, but works with fewer players using **dummies**. More than four players: only four play at a time and
the others swap in after each round (with more than seven, a second table is better).

- A **dummy** is an extra hand with its own score, shown on the scoreboard. Dummies always pass in bidding and are never the
  declarer. Their hand is revealed to everyone when play starts (after the declarer has taken from the Talon and discarded, or at once when there is no Talon stage).
- With 3 players a dummy's cards are played by: the declarer (Rufer, Solo, Besser Rufer); the player who won the previous trick (Trischaken); or the
  declarer's first regular opponent (all other contracts). Such decisions draw on the controller's bank.
- Dummy seats stay in a fixed place in turn order. The starting-player role skips them: if it would land on a dummy it goes to
  the next regular player in line.
- When a match ends, dummies are skipped when deciding the winner and 2nd / 3rd place.
- **3 players:** three regular players plus one dummy (seats: player, dummy, player, player).
- **2 players:** two regular players and two dummies, seated alternately (player, dummy, player, dummy).
  - In 1v3 contracts the player who is not the declarer controls both dummies (they are all on the opposing side).
  - In 2v2 contracts (Rufer, Solo, Besser Rufer) the teams are revealed as soon as the king is called, and each player controls the
    dummy that is on their team. A called king in a dummy's hand makes that dummy the declarer's partner; if the declarer holds the king,
    or plays alone because it is in the Talon, it is a 1v3 game.
  - If the declarer calls the king held by the *other regular player*, nothing is scored and the round is dealt again, with the same
    starting player. Such a reshuffled deal does not count towards a round limit.
  - In Trischaken one player controls both dummies; control passes to whoever wins a trick (a dummy winning a trick changes nothing).
  - The starting player alternates between the two players.
- **More than 4 players:** four sit at the table and the others spectate. After every round the player in seat `round % 4` leaves and the
  spectator who has waited longest takes the seat; the scoreboard lists every participant. Dummies are not used.

---

## 10. Match and timers

### 10.1 Match

A match is a sequence of rounds with a win condition: a target score, a number of rounds, or a **time limit** (when time
runs out the current round is finished, then the match ends). Any mode may also have an optional **fail-safe time limit**
with the same behaviour. Only **regular players'** scores can end a score-based match.

### 10.2 Timers (all configurable, can be off)

1. **Card viewing:** when hands are revealed, all players share **3 minutes**; bidding starts when it runs out or earlier
   when all human players are ready.
2. **Licitation:** at most **20 seconds per decision** for bids, confirm/raise, declarations and contra. In the contra window a
   player can answer "no contra" to skip waiting. When 20 seconds run out: **pass, confirm the current contract, declare no
   bonuses, no contra**.
3. **Bank:** every player has a per-round bank, reset each round: **20 min** (2 players), **15 min** (3 players), **10 min**
   (4 or more). It starts when licitation is over, **from and including the king call**, and ticks **only while the table
   waits for that player's decision**. Dummy decisions drain the controller's bank. Bots are not timed.
4. **Empty bank:** if the **declarer of a 1v3 game** (including a called-king declarer playing alone) runs out, they lose and
   the round ends. Otherwise, each turn the player gets **10 seconds**, after which a **random legal move** is played.

---

## 11. Notes on the original text

- The original says "farben" means no Talon; correct: "solo" means no Talon, "Farben" means tarocks do not trump.
- Farbensolo is worth 6.
- Negative contracts originally said "must lay the highest card"; the rule is now **must beat if possible**.

---

## 12. Assumptions still to be confirmed

These work as written and are easy to change.

1. The contra window closes when a full turn passes without a raise; opponents answer in seat order.
2. In 2v2 contracts, a team's cards are counted together as one pile.
3. In Trischaken the starting player leads trick 1 and the dummy's controller starts as the starting player.
4. Valat is not counted towards Besser Rufer's bid value and cannot be its only declared bonus.
5. The card-viewing phase can end early when all human players are ready.
6. After the contract switches to Dreier from the king-in-Talon options, declared bonuses Dreier does not allow are dropped.
7. A forfeiting declarer's declared bonuses count as lost (at their announced value) and a declared Valat as failed.
8. When a Besser Rufer bid uses the Slovenian method, the declared bonus total must equal the current bid's.
9. In the 2-player variant a called king held by the other player's dummy makes that dummy the declarer's partner (the declarer then controls it, and the other player controls the declarer's... other dummy). A reshuffle repeats the deal with the same starting player and is not counted as a round.
10. With more than 4 players, the seat that is swapped out cycles through the four seats (seat `round % 4`).
11. A target-score match with a tie at the top keeps going until one player leads alone.
