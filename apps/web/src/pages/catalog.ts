export const GAMES = [
  { id: "roulette", title: "Roulette Lab", pv: "wheel", gg: "linear-gradient(135deg,#ff4f8b,#e0344a 45%,#ffb224)", tags: ["Probability", "Expected value"], blurb: "Provably-fair European wheel with live EV for every bet." },
  { id: "pd", title: "Prisoner's Dilemma", pv: "cd", gg: "linear-gradient(135deg,#22d3ee,#3b82f6 55%,#8b6cff)", tags: ["Repeated games", "Cooperation"], blurb: "Face ten classic strategies, then run an Axelrod tournament." },
  { id: "guess", title: "Guess ⅔ of the Average", pv: "bars", gg: "linear-gradient(135deg,#8b6cff,#c026d3 55%,#ff4f8b)", tags: ["Level-k", "Bounded rationality"], blurb: "Beat a crowd of bots that reason 0–3 steps deep." },
  { id: "live", title: "Live Arena", pv: "live", gg: "linear-gradient(135deg,#2fe39e,#14b8a6 45%,#8b6cff)", tags: ["Multiplayer", "Club night"], blurb: "Everyone in the room plays the same ⅔ round in real time." },
  { id: "rps", title: "Rock · Paper · Scissors", pv: "rps", gg: "linear-gradient(135deg,#2fe39e,#10b981 50%,#0ea5e9)", tags: ["Mixed strategy"], blurb: "A bot that learns your patterns. Can you stay at 1/3?" },
  { id: "nash", title: "Nash Solver", pv: "grid", gg: "linear-gradient(135deg,#ffb224,#f97316 55%,#ef4444)", tags: ["Equilibrium"], blurb: "Pure and mixed equilibria for any 2×2 or 3×3 game." },
  { id: "auction", title: "Sealed-Bid Auction", pv: "bars", gg: "linear-gradient(135deg,#14b8a6,#0891b2 50%,#6366f1)", tags: ["Auctions"], blurb: "First-price vs Vickrey against four rival bidders." },
  { id: "ultimatum", title: "Ultimatum Game", pv: "split", gg: "linear-gradient(135deg,#f472b6,#fb7185 45%,#fbbf24)", tags: ["Bargaining", "Fairness"], blurb: "Propose and respond against calibrated bots." },
] as const;
export const MOD_GRAD = ["linear-gradient(135deg,#8b6cff,#22d3ee)", "linear-gradient(135deg,#ffb224,#ff4f8b)", "linear-gradient(135deg,#22d3ee,#2fe39e)", "linear-gradient(135deg,#ff4f8b,#e0344a)", "linear-gradient(135deg,#14b8a6,#6366f1)", "linear-gradient(135deg,#f472b6,#fbbf24)"];
export const TERMS = ["Nash Equilibrium", "Prisoner's Dilemma", "Mechanism Design", "Expected Value", "Tit-for-Tat", "Vickrey Auction", "Schelling Point", "Minimax", "Bayesian Games", "Shapley Value", "Folk Theorem", "Zero-Sum", "Level-k Thinking", "Winner's Curse", "Stag Hunt", "Revenue Equivalence"];
