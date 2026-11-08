"""60-day simulation of a Solidon meme against its stock.

Mirrors the meme contract: x*y=k pool with a 1% USDC-side fee, treasury cash
and stock units, and the mNAV engine (issuance, buyback, redemption) with the
locked parameters from docs/SPEC.md. Python stdlib only, deterministic seeds.

Run:  python3 simulation/sim.py
Writes simulation/RESULTS.md and simulation/charts/<scenario>.svg, and exits
non-zero when any SPEC check fails.
"""

import copy
import functools
import math
import random
import statistics
import sys
from dataclasses import dataclass, field
from pathlib import Path

# Locked parameters (docs/SPEC.md "Mechanics & locked parameters").
POOL_FEE = 0.01
TREASURY_FEE = 0.008
ISSUANCE_MNAV = 2.0
MAX_ISSUANCE_PER_EPOCH = 0.01  # of circulating supply per 24 h
BUYBACK_MNAV = 1.0
REDEMPTION_MNAV = 0.9
CASH_BUFFER = 0.20  # of NAV
CASH_REFILL = 0.10  # of NAV
SWAP_SLIPPAGE = 0.01  # minAmountOut on the BSC stock swap
CALLER_TIP = 0.0005

STEP_MIN = 5
STEPS_PER_HOUR = 60 // STEP_MIN
STEPS_PER_DAY = 24 * STEPS_PER_HOUR
DAYS = 60
TWAP_STEPS = 30 // STEP_MIN
ORACLE_MAX_AGE_STEPS = 15 // STEP_MIN
ARB_MARGIN = 0.02  # arbitrageurs redeem only when the discount beats fees + 2%

OUT = Path(__file__).parent


@dataclass
class Meme:
    meme_reserve: float  # M: pool inventory
    usdc_reserve: float  # U
    supply: float  # T: total supply
    cash: float  # C: treasury USDC
    stock_units: float  # S
    # SPEC v1 rule: buyback may spend cash down to the 10% refill level, so the
    # refill sells stock to fund the next buyback. Kept to reproduce the finding.
    legacy_buyback: bool = False
    redemption_open: bool = False
    epoch_start_step: int = 0
    epoch_issued: float = 0.0
    epoch_cap: float = 0.0
    spots: list = field(default_factory=list)
    issuances: int = 0
    accretion_ok: bool = True

    # --- views -------------------------------------------------------------
    @property
    def circulating(self):
        return self.supply - self.meme_reserve

    @property
    def spot(self):
        return self.usdc_reserve / self.meme_reserve

    def nav_total(self, price):
        return self.stock_units * price + self.cash

    def nav(self, price):
        q = self.circulating
        return self.nav_total(price) / q if q > 0 else 0.0

    def twap(self):
        return statistics.fmean(self.spots[-TWAP_STEPS:])

    # --- pool --------------------------------------------------------------
    def buy(self, usdc):
        net = usdc * (1 - POOL_FEE)
        out = self.meme_reserve * net / (self.usdc_reserve + net)
        self.usdc_reserve += net
        self.meme_reserve -= out
        self.cash += usdc * TREASURY_FEE  # 0.2% creator fee leaves the system
        return out

    def sell(self, meme):
        meme = min(meme, self.circulating)
        gross = self.usdc_reserve * meme / (self.meme_reserve + meme)
        self.meme_reserve += meme
        self.usdc_reserve -= gross
        self.cash += gross * TREASURY_FEE
        return gross * (1 - POOL_FEE)

    # --- mNAV engine (one action per hour, called by anyone) ---------------
    def rebalance(self, step, price, stale):
        if stale or self.circulating <= 0:
            return None
        nav = self.nav(price)
        if nav <= 0:
            self.redemption_open = False
            return None
        mnav = self.twap() / nav
        self.redemption_open = mnav < REDEMPTION_MNAV
        if step - self.epoch_start_step >= STEPS_PER_DAY or self.epoch_cap == 0:
            self.epoch_start_step, self.epoch_issued = step, 0.0
            self.epoch_cap = MAX_ISSUANCE_PER_EPOCH * self.circulating

        value = 0.0
        if mnav > ISSUANCE_MNAV:
            # Sell just enough new memes to bring spot back to 2x NAV, capped.
            target_m = math.sqrt(self.meme_reserve * self.usdc_reserve / (ISSUANCE_MNAV * nav))
            q = min(max(target_m - self.meme_reserve, 0), self.epoch_cap - self.epoch_issued)
            proceeds = self.usdc_reserve * q / (self.meme_reserve + q) if q > 0 else 0
            # Accretion rule: each new token is sold at or above NAV per token.
            if q > 0 and proceeds / q >= nav:
                before = nav
                self.meme_reserve += q
                self.usdc_reserve -= proceeds
                self.supply += q
                self.cash += proceeds
                self.epoch_issued += q
                self.issuances += 1
                # NAV per token counts the new tokens as if already circulating.
                after = self.nav_total(price) / (self.circulating + q)
                self.accretion_ok &= after >= before * (1 - 1e-9)
                value = proceeds
        elif mnav < BUYBACK_MNAV:
            # Spend only cash above the 20% buffer to lift spot toward NAV, then burn.
            # Never sell stock for a buyback: the burned tokens are pool inventory,
            # so each buyback moves treasury value into the pool (see RESULTS.md).
            target_u = math.sqrt(self.meme_reserve * self.usdc_reserve * nav)
            floor = CASH_REFILL if self.legacy_buyback else CASH_BUFFER
            spend = min(max(target_u - self.usdc_reserve, 0), self.cash - floor * self.nav_total(price))
            if spend > 0:
                out = self.meme_reserve * spend / (self.usdc_reserve + spend)
                self.usdc_reserve += spend
                self.meme_reserve -= out
                self.supply -= out
                self.cash -= spend
                value = spend
        self.cash -= value * CALLER_TIP
        self.manage_cash(price)
        return mnav

    def manage_cash(self, price):
        """Keep cash at 20% of NAV: surplus buys stock on BSC, shortfall below 10% sells it."""
        total = self.nav_total(price)
        if self.cash > CASH_BUFFER * total:
            spend = self.cash - CASH_BUFFER * total
            self.cash -= spend
            self.stock_units += spend / price * (1 - SWAP_SLIPPAGE)
        elif self.cash < CASH_REFILL * total and self.stock_units > 0:
            need = min(CASH_BUFFER * total - self.cash, self.stock_units * price)
            self.stock_units -= need / price
            self.cash += need * (1 - SWAP_SLIPPAGE)

    def redeem(self, tokens, price):
        """Burn up to `tokens` for NAV per token, paid from cash. Returns tokens burned."""
        nav = self.nav(price)
        tokens = min(tokens, self.circulating, self.cash / nav)
        self.supply -= tokens
        self.cash -= tokens * nav
        return tokens

    def can_redeem(self, price, stale):
        return self.redemption_open and not stale and self.spot < self.nav(price) * (1 - POOL_FEE)

    def arbitrage_redeem(self, price, stale):
        """Buy below NAV in the pool and redeem at NAV while the window is open."""
        if not self.can_redeem(price, stale):
            return
        nav = self.nav(price)
        limit = nav * (1 - POOL_FEE - ARB_MARGIN)
        if self.spot >= limit:
            return
        target_u = math.sqrt(self.meme_reserve * self.usdc_reserve * limit)
        usdc = (target_u - self.usdc_reserve) / (1 - POOL_FEE)
        usdc = min(usdc, self.cash * 0.9)  # payout is capped by cash on hand
        if usdc <= 0:
            return
        self.redeem(self.buy(usdc), price)


# --- scenarios ---------------------------------------------------------------
# Traders move the meme price by `beta` x the stock move, plus hype drift and
# noise. Flows are sized against pool depth so price impact matches the move.
@dataclass
class Scenario:
    name: str
    title: str
    stock_drift: callable  # day -> daily drift of the stock
    hype: callable  # day -> daily drift of meme demand
    stale: callable = lambda day: False
    stock_vol: float = 0.02
    hype_vol: float = 0.05
    beta: float = 1.5


SCENARIOS = [
    Scenario("steady_bull", "Steady bull", lambda d: 0.3 / DAYS, lambda d: 0.01),
    Scenario("bull_fade", "Bull then hype fades",
             lambda d: 0.3 / 30 if d < 30 else 0.0, lambda d: 0.01 if d < 30 else -0.03),
    Scenario("crash", "Stock crash", lambda d: -0.3 / DAYS, lambda d: -0.02, stock_vol=0.03),
    Scenario("chop", "Sideways chop", lambda d: 0.05 * 2 * math.pi / 10 * math.cos(2 * math.pi * d / 10),
             lambda d: 0.0),
    Scenario("weekend_gap", "Weekend gap", lambda d: 0.0, lambda d: 0.0,
             stale=lambda d: 20 <= d < 22, stock_vol=0.0),
]


SEED_USDC = 10_000.0
LAUNCH_DAYS = 90
LAUNCH = Scenario("launch", "Launch", lambda d: 0.0, lambda d: 0.05)


@functools.cache
def _launch(seed):
    """Day 0 of every scenario: a fresh pool seeded with 10k USDC, then 90 days of
    hype buying (+5%/day demand drift, stock flat). The treasury is built only by
    fees and issuance, so pool and treasury are consistent with the contract."""
    meme = Meme(meme_reserve=1e9, usdc_reserve=SEED_USDC, supply=1e9, cash=0, stock_units=0)
    rows, _, meme, _ = run(LAUNCH, seed=seed, meme=meme, stock_price=180.0, days=LAUNCH_DAYS)
    # Steps restart at 0 in each scenario, so the issuance epoch restarts too.
    meme.issuances, meme.accretion_ok, meme.epoch_cap = 0, True, 0.0
    return meme, rows[-1][2], rows


def initial_meme(seed=7):
    meme, price, rows = _launch(seed)
    return copy.deepcopy(meme), price, rows


def run(sc, seed=7, legacy_buyback=False, meme=None, stock_price=None, days=DAYS):
    rng = random.Random(seed)
    if meme is None:
        meme, stock_price, _ = initial_meme(seed)
    meme.legacy_buyback = legacy_buyback
    meme.spots = [meme.spot] * TWAP_STEPS
    rows = []  # one row per hour
    oracle_price, stale_steps = stock_price, 0
    mnavs, stale_actions = [], 0

    for step in range(days * STEPS_PER_DAY):
        day = step / STEPS_PER_DAY
        sd = 1 / math.sqrt(STEPS_PER_DAY)
        r = sc.stock_drift(day) / STEPS_PER_DAY + sc.stock_vol * sd * rng.gauss(0, 1)
        stale = sc.stale(day)
        if not stale:
            stock_price *= 1 + r
            oracle_price = stock_price
        stale_steps = stale_steps + 1 if stale else 0
        oracle_stale = stale_steps > ORACLE_MAX_AGE_STEPS

        # Trader flow, in USDC, sized against pool depth (dp/p ~ 2 * flow / U).
        move = (sc.beta * (r if not stale else 0) + sc.hype(day) / STEPS_PER_DAY
                + sc.hype_vol * sd * rng.gauss(0, 1))
        flow = meme.usdc_reserve * move / 2
        if flow > 0:
            meme.buy(flow)
        elif flow < 0:
            tokens = -flow / meme.spot
            # A rational seller redeems at NAV while the window is open, sells the rest.
            if meme.can_redeem(oracle_price, oracle_stale):
                tokens -= meme.redeem(tokens, oracle_price)
            if tokens > 0:
                meme.sell(tokens)

        meme.arbitrage_redeem(oracle_price, oracle_stale)
        meme.spots.append(meme.spot)
        del meme.spots[:-TWAP_STEPS]

        if step % STEPS_PER_HOUR == 0:
            mnav = meme.rebalance(step, oracle_price, oracle_stale)
            if oracle_stale and mnav is not None:
                stale_actions += 1
            if mnav is not None:
                mnavs.append(mnav)
            rows.append((day, meme.spot, stock_price, meme.nav(oracle_price), meme.supply,
                         meme.stock_units / max(meme.circulating, 1)))
    return rows, mnavs, meme, stale_actions


# --- metrics -----------------------------------------------------------------
def daily(rows, i):
    return [rows[k][i] for k in range(0, len(rows), 24)] + [rows[-1][i]]


def returns(xs):
    return [b / a - 1 for a, b in zip(xs, xs[1:])]


def max_drawdown(xs):
    peak, dd = xs[0], 0.0
    for x in xs:
        peak = max(peak, x)
        dd = min(dd, x / peak - 1)
    return dd


def metrics(rows, mnavs, meme):
    mp, sp = daily(rows, 1), daily(rows, 2)
    rm, rs = returns(mp), returns(sp)
    var = statistics.pvariance(rs)
    beta = statistics.covariance(rm, rs) / var if var > 0 else float("nan")
    corr = statistics.correlation(rm, rs) if var > 0 else float("nan")
    floor = min(r[1] / r[3] for r in rows if r[3] > 0)
    return {
        "meme_return": mp[-1] / mp[0] - 1,
        "stock_return": sp[-1] / sp[0] - 1,
        "nav_return": rows[-1][3] / rows[0][3] - 1,
        "corr": corr,
        "beta": beta,
        "meme_dd": max_drawdown(mp),
        "stock_dd": max_drawdown(sp),
        "min_mnav": min(mnavs),
        "min_spot_mnav": floor,
        "supply_change": rows[-1][4] / rows[0][4] - 1,
        "units_per_token_0": rows[0][5],
        "units_per_token_60": rows[-1][5],
        "issuances": meme.issuances,
        "accretion_ok": meme.accretion_ok,
    }


SEEDS = range(1, 13)


def longest_below(mnavs, level=REDEMPTION_MNAV):
    """Longest run of consecutive hourly rebalances with mNAV below `level`."""
    best = cur = 0
    for x in mnavs:
        cur = cur + 1 if x < level else 0
        best = max(best, cur)
    return best


def max_daily_supply_growth(rows):
    supply = [r[4] for r in rows]
    return max(b / a - 1 for a, b in zip(supply[::24], supply[24::24]))


def checks(name, runs):
    """SPEC checks over all seeds. `runs` is a list of (metrics, rows, mnavs, stale_actions)."""
    med = lambda k: statistics.median(m[k] for m, *_ in runs)
    floor_ok = all(longest_below(mn) <= 2 for _, _, mn, _ in runs)
    common = [("every issuance is accretive (all seeds)", all(m["accretion_ok"] for m, *_ in runs))]
    per = {
        "steady_bull": [
            ("median meme return > median stock return", med("meme_return") > med("stock_return")),
            ("median beta to the stock > 1", med("beta") > 1),
            ("stock units per token rise (all seeds)",
             all(m["units_per_token_60"] > m["units_per_token_0"] for m, *_ in runs)),
        ],
        "bull_fade": [("mNAV back at >= 0.9 within 2 hours of dropping below (all seeds)", floor_ok)],
        "crash": [
            ("meme falls with the stock (median return < 0, median corr > 0)",
             med("meme_return") < 0 and med("corr") > 0),
            ("mNAV back at >= 0.9 within 2 hours of dropping below (all seeds)", floor_ok),
        ],
        "chop": [("supply growth per day within the 1% cap (all seeds)",
                  all(max_daily_supply_growth(r) <= MAX_ISSUANCE_PER_EPOCH * 1.0001 for _, r, _, _ in runs))],
        "weekend_gap": [("no mNAV action while the oracle is stale (all seeds)",
                         all(st == 0 for *_, st in runs))],
    }
    return common + per[name]


# --- output ------------------------------------------------------------------
def svg_chart(title, rows, path):
    w, h, pad = 720, 300, 40
    series = [("meme price", 1, "#111"), ("stock", 2, "#888"), ("NAV per token", 3, "#111")]
    idx = [[r[i] / rows[0][i] * 100 for r in rows] for _, i, _ in series]
    lo, hi = min(min(s) for s in idx), max(max(s) for s in idx)
    x = lambda k: pad + k * (w - 2 * pad) / (len(rows) - 1)
    y = lambda v: h - pad - (v - lo) * (h - 2 * pad) / (hi - lo or 1)
    parts = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" font-family="sans-serif" font-size="12">',
             f'<rect width="{w}" height="{h}" fill="#fff"/>',
             f'<text x="{pad}" y="20" font-weight="bold">{title} (index, day 0 = 100)</text>']
    for v in (lo, 100, hi):
        parts.append(f'<line x1="{pad}" x2="{w - pad}" y1="{y(v):.1f}" y2="{y(v):.1f}" stroke="#eee"/>'
                     f'<text x="4" y="{y(v) + 4:.1f}" fill="#666">{v:.0f}</text>')
    for (label, _, color), s, k in zip(series, idx, range(3)):
        pts = " ".join(f"{x(i):.1f},{y(v):.1f}" for i, v in enumerate(s))
        dash = ' stroke-dasharray="5 4"' if label.startswith("NAV") else ""
        parts.append(f'<polyline fill="none" stroke="{color}" stroke-width="1.5"{dash} points="{pts}"/>')
        mark = "- -" if dash else "—"
        parts.append(f'<text x="{pad + k * 140}" y="{h - 10}" fill="{color}">{mark} {label}</text>')
    parts.append("</svg>")
    path.write_text("\n".join(parts))


def pct(v):
    return f"{v * 100:+.1f}%"


def main():
    (OUT / "charts").mkdir(exist_ok=True)
    head = ("| Scenario | Meme | Stock | NAV/token | Corr | Beta | Meme max DD | Stock max DD | Min mNAV "
            "| Longest < 0.9 | Supply | Stock units/token |")
    lines = ["# Simulation results", "",
             "Generated by `python3 simulation/sim.py`. Do not edit by hand.", "",
             "## Setup", "",
             f"- Day 0 of every scenario is the end of a {LAUNCH_DAYS}-day launch: a fresh pool seeded with "
             f"{SEED_USDC:,.0f} USDC and the full supply, then hype buying. The treasury is built only by pool "
             "fees and issuance, exactly as in the contract.",
             "- Traders move the meme by 1.5x the stock's move, plus a hype drift and noise (5%/day). "
             "Sellers redeem at NAV while the redemption window is open and the pool pays less; "
             "arbitrageurs buy below NAV and redeem.",
             "- 5-minute steps, `rebalance()` every hour, 30-minute TWAP, 15-minute oracle staleness brake, "
             "1% slippage on every stock trade.",
             f"- Each scenario runs {len(SEEDS)} seeds. Tables show the median across seeds; "
             "\"Min mNAV\" and \"Longest < 0.9\" are the worst seed.", "",
             "## Results (median of 12 seeds)", "", head,
             "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |"]
    check_lines, failed = [], 0
    for sc in SCENARIOS:
        runs = []
        for seed in SEEDS:
            rows, mnavs, meme, stale_actions = run(sc, seed=seed)
            runs.append((metrics(rows, mnavs, meme), rows, mnavs, stale_actions))
        med = lambda k: statistics.median(m[k] for m, *_ in runs)
        beta = "n/a" if math.isnan(med("beta")) else f"{med('beta'):.2f}"
        corr = "n/a" if math.isnan(med("corr")) else f"{med('corr'):.2f}"
        lines.append(
            f"| {sc.title} | {pct(med('meme_return'))} | {pct(med('stock_return'))} | {pct(med('nav_return'))} "
            f"| {corr} | {beta} | {pct(med('meme_dd'))} | {pct(med('stock_dd'))} "
            f"| {min(m['min_mnav'] for m, *_ in runs):.2f} | {max(longest_below(mn) for _, _, mn, _ in runs)} h "
            f"| {pct(med('supply_change'))} | {pct(med('units_per_token_60') / med('units_per_token_0') - 1)} |")
        svg_chart(f"{sc.title}, seed 1", runs[0][1], OUT / "charts" / f"{sc.name}.svg")
        for label, ok in checks(sc.name, runs):
            failed += not ok
            check_lines.append(f"| {sc.title} | {label} | {'pass' if ok else '**FAIL**'} |")
        print(f"{sc.title:22} meme {pct(med('meme_return')):>7} stock {pct(med('stock_return')):>7} "
              f"beta {beta} worst min mNAV {min(m['min_mnav'] for m, *_ in runs):.2f}")

    lines += ["", "## Checks from docs/SPEC.md", "", "| Scenario | Check | Result |", "| --- | --- | --- |",
              *check_lines, ""]
    lines += finding_section()
    lines += ["", "## Charts (seed 1)", ""]
    lines += [f"![{sc.title}](charts/{sc.name}.svg)" for sc in SCENARIOS]
    (OUT / "RESULTS.md").write_text("\n".join(lines) + "\n")
    print(f"{failed} check(s) failed" if failed else "all checks pass")
    sys.exit(1 if failed else 0)


def finding_section():
    """Stock crash with the SPEC v1 buyback rule versus the adopted rule."""
    out = ["## Finding: buyback must not sell stock", "",
           "Tokens bought back come from the pool's inventory, not from holders, so circulating supply does "
           "not fall and each buyback lowers NAV per token. Under the SPEC v1 rule (spend cash down to the 10% "
           "refill level), the refill then sells stock to top cash back up, and the next buyback spends it again. "
           "Adopted rule: a buyback only spends cash above the 20% buffer and never triggers a stock sale. "
           "Redemption, which is value-neutral, carries the floor.", "",
           "| Stock crash, median of 12 seeds | Stock units per token, day 60 vs day 0 | NAV/token | Worst min mNAV |",
           "| --- | --- | --- | --- |"]
    for label, legacy in (("SPEC v1 buyback (cash down to 10%)", True), ("Adopted (cash above 20% only)", False)):
        ms = [metrics(*run(SCENARIOS[2], seed=s, legacy_buyback=legacy)[:3]) for s in SEEDS]
        med = lambda k: statistics.median(m[k] for m in ms)
        out.append(f"| {label} | {pct(med('units_per_token_60') / med('units_per_token_0') - 1)} "
                   f"| {pct(med('nav_return'))} | {min(m['min_mnav'] for m in ms):.2f} |")
    return out


if __name__ == "__main__":
    main()
