# Sambhav design system — "Strategy Aurora"

## What we learned from leading club sites

| Site | Pattern worth copying | Where it lives in Sambhav |
|---|---|---|
| [MIT Traders](https://traders.mit.edu/about) | Numbered programmes (01–04), prestige of a flagship competition, board grid | Home → "Four programmes" pillars; Core team grid |
| [MIT Poker Club](https://poker.mit.edu/) | "All levels welcome", decision-making framed as a transferable skill | Hero copy, About mission |
| [Harvard Computer Society](https://hcs.harvard.edu/) | Heritage + programme cards + sponsors + newsletter CTA | Bento "What we do", CTA band |
| [Berkeley Launchpad](https://www.callaunchpad.org/) | Big stat counters, two CTAs, project cards, sponsor strip | Stats strip with count-up, dual hero CTAs, game tiles |
| [Stanford ACM](https://stanfordacm.org/) | Every programme listed with its logistics | Events + Learn module meta (hours, lessons) |
| [IIT Bombay Techfest](https://en.wikipedia.org/wiki/Techfest) | Immersive dark theme, scale numbers, competition-first IA | Dark-first aurora stage, Arena as the centrepiece |
| [2026 web trends](https://line25.com/articles/web-design-trends-2026/) | Bento grids, scroll-driven animation, oversized type, variable fonts, glass layers, dark-first saturated colour | Whole system |

## Tokens
| Token | Dark (default) | Light | Use |
|---|---|---|---|
| `--bg` | `#07081a` | `#f6f6fd` | stage |
| `--brand` | `#8b6cff` violet | `#6040f0` | primary actions |
| `--brand-2` | `#22d3ee` cyan | `#0891b2` | links, eyebrows |
| `--accent` | `#ffb224` saffron | `#d97706` | equilibrium highlights |
| `--hot` | `#ff4f8b` magenta | `#db2777` | events, warm gradient |
| `--good` | `#2fe39e` | `#059669` | present, wins |
| `--grad` | violet → cyan → mint | — | primary buttons, rings, bars |
| Display / body / data | Bricolage Grotesque (variable opsz) · Manrope · JetBrains Mono | | |

Each game owns a gradient (roulette crimson→saffron, PD cyan→violet, ⅔ violet→magenta, RPS mint→sky, Nash amber→red, auction teal→indigo, ultimatum rose→gold) and each module owns a hue.

## Motion
| Effect | Technique | Respects reduced motion |
|---|---|---|
| Strategy constellation (hero) | Canvas particles linked by distance, attracted to pointer, paused off-screen | static frame |
| Kinetic headline | Rotating word slot (cooperate / bluff / bid / defect / outthink) | stops |
| Section reveals | CSS `animation-timeline: view()` (no JS observers; content visible without support) | disabled |
| Stat counters | Count-up on first intersection | final value only |
| Cards | Pointer spotlight, 3D tilt, animated conic gradient borders | disabled |
| Buttons | Magnetic hover | disabled |
| Celebrations | Confetti on quiz pass, wins, check-in, joining | disabled |
| Chrome | Scroll progress bar, back-to-top, cursor glow, Ctrl/⌘+K palette, route view transitions | static |
