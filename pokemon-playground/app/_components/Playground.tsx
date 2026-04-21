"use client";

import {
  createContext,
  memo,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AnimatePresence, motion } from "framer-motion";

/* =============================================================================
 * TRAINER PLAYGROUND — Pokémon TikTok Trend Hub
 * Industrial minimalist. Sharp 90° corners. 1px lines. Mono palette + 1 accent.
 * One tight component tree: shared state → 4 games.
 * ========================================================================== */

/* -------------------------------- TYPES -------------------------------- */

type GenKey = "all" | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

type PokeStats = {
  hp: number;
  atk: number;
  def: number;
  spa: number;
  spd: number;
  spe: number;
  total: number;
};

type Pokemon = {
  id: number;
  name: string;
  types: string[];
  abilities: string[];
  stats: PokeStats;
  height: number; // decimetres
  weight: number; // hectograms
  sprite: string;
};

type GameId = "DRAFT" | "BOSS" | "STATS" | "TYPES";

/* ------------------------------ CONSTANTS ------------------------------ */

const GEN_RANGES: Record<Exclude<GenKey, "all">, [number, number]> = {
  1: [1, 151],
  2: [152, 251],
  3: [252, 386],
  4: [387, 493],
  5: [494, 649],
  6: [650, 721],
  7: [722, 809],
  8: [810, 905],
  9: [906, 1025],
};

const GEN_LABELS: Record<GenKey, string> = {
  all: "ALL",
  1: "I",
  2: "II",
  3: "III",
  4: "IV",
  5: "V",
  6: "VI",
  7: "VII",
  8: "VIII",
  9: "IX",
};

// Legendaries + Mythicals + Ultra Beasts + Paradox mons — "BOSS" pool.
const LEGENDARY_IDS = [
  144, 145, 146, 150, 151,
  243, 244, 245, 249, 250, 251,
  377, 378, 379, 380, 381, 382, 383, 384, 385, 386,
  480, 481, 482, 483, 484, 485, 486, 487, 488, 489, 490, 491, 492, 493,
  494, 638, 639, 640, 641, 642, 643, 644, 645, 646, 647, 648, 649,
  716, 717, 718, 719, 720, 721,
  772, 773, 785, 786, 787, 788, 789, 790, 791, 792, 793, 794, 795, 796,
  797, 798, 799, 800, 801, 802, 803, 804, 805, 806, 807, 808, 809,
  888, 889, 890, 891, 892, 894, 895, 896, 897, 898, 905,
  1001, 1002, 1003, 1004, 1007, 1008, 1014, 1015, 1016, 1017, 1020, 1021,
  1022, 1023, 1024, 1025,
];

const ALL_TYPES = [
  "normal", "fire", "water", "electric", "grass", "ice",
  "fighting", "poison", "ground", "flying", "psychic", "bug",
  "rock", "ghost", "dragon", "dark", "steel", "fairy",
];

const STAT_KEYS = ["hp", "atk", "def", "spa", "spd", "spe"] as const;
type StatKey = (typeof STAT_KEYS)[number];

const DRAFT_SLOTS = ["typing", "ability", ...STAT_KEYS] as const;
type DraftSlot = (typeof DRAFT_SLOTS)[number];

const SLOT_LABEL: Record<DraftSlot, string> = {
  typing: "TYPING",
  ability: "ABILITY",
  hp: "HP",
  atk: "ATK",
  def: "DEF",
  spa: "SPA",
  spd: "SPD",
  spe: "SPE",
};

/* Snake order 1-2-2-1, 16 picks total (8 slots × 2 players). */
const SNAKE_ORDER: (1 | 2)[] = [
  1, 2, 2, 1,
  1, 2, 2, 1,
  1, 2, 2, 1,
  1, 2, 2, 1,
];

const HL_CATEGORIES = [
  "hp", "atk", "def", "spa", "spd", "spe",
  "weight", "height", "id",
] as const;
type HLCategory = (typeof HL_CATEGORIES)[number];

const HL_LABEL: Record<HLCategory, string> = {
  hp: "BASE HP",
  atk: "BASE ATK",
  def: "BASE DEF",
  spa: "BASE SPA",
  spd: "BASE SPD",
  spe: "BASE SPE",
  weight: "WEIGHT (hg)",
  height: "HEIGHT (dm)",
  id: "DEX #",
};

/* ----------------------------- PokeAPI CORE ---------------------------- */

const POKE_CACHE = new Map<string | number, Pokemon>();
const POKE_INFLIGHT = new Map<string | number, Promise<Pokemon | null>>();

async function fetchPokemonRaw(
  key: string | number,
): Promise<Pokemon | null> {
  const cacheKey = typeof key === "string" ? key.toLowerCase().trim() : key;
  const cached = POKE_CACHE.get(cacheKey);
  if (cached) return cached;
  const live = POKE_INFLIGHT.get(cacheKey);
  if (live) return live;

  const req = (async () => {
    try {
      const res = await fetch(
        `https://pokeapi.co/api/v2/pokemon/${cacheKey}`,
        { cache: "force-cache" },
      );
      if (!res.ok) return null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data: any = await res.json();
      const stats: PokeStats = {
        hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0, total: 0,
      };
      for (const s of data.stats) {
        const n = s.base_stat as number;
        switch (s.stat.name) {
          case "hp": stats.hp = n; break;
          case "attack": stats.atk = n; break;
          case "defense": stats.def = n; break;
          case "special-attack": stats.spa = n; break;
          case "special-defense": stats.spd = n; break;
          case "speed": stats.spe = n; break;
        }
      }
      stats.total =
        stats.hp + stats.atk + stats.def + stats.spa + stats.spd + stats.spe;

      const sprite: string =
        data.sprites?.other?.["official-artwork"]?.front_default ??
        data.sprites?.front_default ??
        "";

      const pokemon: Pokemon = {
        id: data.id,
        name: data.name,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        types: (data.types ?? []).map((t: any) => t.type.name as string),
        abilities: Array.from(
          new Set(
            (data.abilities ?? []).map(
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (a: any) => a.ability.name as string,
            ),
          ),
        ),
        stats,
        height: data.height ?? 0,
        weight: data.weight ?? 0,
        sprite,
      };
      POKE_CACHE.set(pokemon.id, pokemon);
      POKE_CACHE.set(pokemon.name, pokemon);
      return pokemon;
    } catch {
      return null;
    } finally {
      POKE_INFLIGHT.delete(cacheKey);
    }
  })();

  POKE_INFLIGHT.set(cacheKey, req);
  return req;
}

function genRange(gen: GenKey): [number, number] {
  if (gen === "all") return [1, 1025];
  return GEN_RANGES[gen];
}

function randomIdInGen(gen: GenKey): number {
  const [lo, hi] = genRange(gen);
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}

function randomBossIdInGen(gen: GenKey): number {
  const [lo, hi] = genRange(gen);
  const pool = LEGENDARY_IDS.filter((id) => id >= lo && id <= hi);
  if (pool.length === 0) {
    // fallback: any high-BST candidate in range (e.g. pseudo-legendary ranges)
    return lo + Math.floor(Math.random() * (hi - lo + 1));
  }
  return pool[Math.floor(Math.random() * pool.length)];
}

async function fetchRandomPokemon(
  gen: GenKey,
  opts: { attempts?: number; excludeIds?: Set<number> } = {},
): Promise<Pokemon | null> {
  const { attempts = 6, excludeIds } = opts;
  for (let i = 0; i < attempts; i++) {
    const id = randomIdInGen(gen);
    if (excludeIds?.has(id)) continue;
    const p = await fetchPokemonRaw(id);
    if (p) return p;
  }
  return null;
}

async function fetchRandomBoss(gen: GenKey): Promise<Pokemon | null> {
  for (let i = 0; i < 5; i++) {
    const id = randomBossIdInGen(gen);
    const p = await fetchPokemonRaw(id);
    if (p && (p.stats.total >= 580 || LEGENDARY_IDS.includes(p.id))) return p;
    if (p && i === 4) return p;
  }
  return null;
}

/* --------------------------- NAME POOL (for reel) ------------------------ */

/* Small rotating alias table used only for the visual name-reel; real data is
   always fetched via fetchPokemonRaw. */
const REEL_PLACEHOLDER_NAMES = [
  "bulbasaur", "charmander", "squirtle", "pidgey", "pikachu",
  "vulpix", "geodude", "magikarp", "eevee", "snorlax",
  "mareep", "togepi", "umbreon", "tyranitar", "skarmory",
  "treecko", "torchic", "mudkip", "gardevoir", "salamence",
  "turtwig", "chimchar", "piplup", "lucario", "garchomp",
  "snivy", "tepig", "oshawott", "zoroark", "hydreigon",
  "chespin", "fennekin", "froakie", "sylveon", "goodra",
  "rowlet", "litten", "popplio", "mimikyu", "dragapult",
  "sprigatito", "fuecoco", "quaxly", "tinkaton", "baxcalibur",
];

/* ----------------------------- CONTEXTS ------------------------------ */

type PokeAPIContextValue = {
  gen: GenKey;
  setGen: (g: GenKey) => void;
  randomPokemon: (opts?: {
    excludeIds?: Set<number>;
  }) => Promise<Pokemon | null>;
  randomBoss: () => Promise<Pokemon | null>;
  byId: (id: number) => Promise<Pokemon | null>;
  byName: (name: string) => Promise<Pokemon | null>;
};

const PokeAPIContext = createContext<PokeAPIContextValue | null>(null);

function usePoke(): PokeAPIContextValue {
  const ctx = useContext(PokeAPIContext);
  if (!ctx) throw new Error("PokeAPIContext missing");
  return ctx;
}

/* =========================================================================
 *                            UI PRIMITIVES
 * ========================================================================= */

const LINE = "border border-[color:var(--color-line)]";

function Button({
  children,
  onClick,
  disabled,
  variant = "default",
  className = "",
  type = "button",
  title,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "default" | "accent" | "ghost";
  className?: string;
  type?: "button" | "submit";
  title?: string;
}) {
  const base =
    "inline-flex items-center justify-center gap-2 px-4 py-2 text-[11px] uppercase tracking-[0.2em] border select-none transition-colors duration-100 ease-linear disabled:opacity-40 disabled:cursor-not-allowed";
  const styles =
    variant === "accent"
      ? "border-[color:var(--color-accent)] text-[var(--color-accent)] hover:bg-[var(--color-accent)] hover:text-[var(--color-paper)]"
      : variant === "ghost"
      ? "border-transparent hover:border-[color:var(--color-line)]"
      : "border-[color:var(--color-line)] hover:bg-[var(--color-ink)] hover:text-[var(--color-paper)]";
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`${base} ${styles} ${className}`}
    >
      {children}
    </button>
  );
}

function TypeChip({ type, active = true }: { type: string; active?: boolean }) {
  return (
    <span
      className={`inline-block px-2 py-[2px] text-[10px] uppercase tracking-[0.2em] border ${LINE} ${
        active
          ? "bg-[var(--color-ink)] text-[var(--color-paper)]"
          : "bg-transparent"
      }`}
    >
      {type}
    </span>
  );
}

function Heart({ filled }: { filled: boolean }) {
  return (
    <span
      className={`inline-block w-6 h-6 border ${LINE} text-center leading-[22px] text-[11px] ${
        filled
          ? "bg-[var(--color-accent)] text-[var(--color-paper)] border-[color:var(--color-accent)]"
          : "opacity-40"
      }`}
    >
      {filled ? "<3" : "--"}
    </span>
  );
}

/* PixelSprite — subtle render so we always have something even if API fails. */
function Sprite({
  pokemon,
  size = 140,
  dim = false,
}: {
  pokemon: Pokemon | null;
  size?: number;
  dim?: boolean;
}) {
  return (
    <div
      className={`relative ${LINE} bg-[var(--color-paper)] bg-grid flex items-center justify-center overflow-hidden`}
      style={{ width: size, height: size }}
    >
      {pokemon?.sprite ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={pokemon.sprite}
          alt={pokemon.name}
          width={size}
          height={size}
          style={{
            imageRendering: "auto",
            filter: dim
              ? "grayscale(1) contrast(1.1) brightness(0)"
              : "grayscale(1) contrast(1.05)",
            objectFit: "contain",
            width: "85%",
            height: "85%",
          }}
        />
      ) : (
        <span className="text-[10px] opacity-50 uppercase tracking-[0.2em]">
          no data
        </span>
      )}
      <span className="absolute top-1 left-1 text-[9px] opacity-60 tracking-[0.2em]">
        #{pokemon ? String(pokemon.id).padStart(4, "0") : "----"}
      </span>
    </div>
  );
}

/* =========================================================================
 *                              SLOT REEL
 * ========================================================================= */

/**
 * Vertical ticker that rapidly cycles random Pokémon names.
 * Purely visual — the "stop" handler resolves an actual API random pick.
 */
function sampleReelFrame(): string[] {
  return Array.from(
    { length: 5 },
    () =>
      REEL_PLACEHOLDER_NAMES[
        Math.floor(Math.random() * REEL_PLACEHOLDER_NAMES.length)
      ],
  );
}

function SlotReel({
  running,
  onStop,
  label = "SELECTOR",
  stopLabel = "STOP",
}: {
  running: boolean;
  onStop: () => void;
  label?: string;
  stopLabel?: string;
}) {
  const [frame, setFrame] = useState<string[]>(() => sampleReelFrame());
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setFrame(sampleReelFrame()), 60);
    return () => window.clearInterval(id);
  }, [running]);

  return (
    <div className={`${LINE} flex flex-col min-w-[220px]`}>
      <div className="px-3 py-1.5 text-[10px] uppercase tracking-[0.25em] border-b border-[color:var(--color-line)] flex justify-between">
        <span>{label}</span>
        <span className="opacity-50">{running ? "LIVE" : "IDLE"}</span>
      </div>
      <div className="relative h-[128px] overflow-hidden bg-scanlines">
        <div
          className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-[26px] border-y border-[color:var(--color-accent)] pointer-events-none"
          aria-hidden
        />
        <div className="flex flex-col items-center justify-center h-full text-[13px] uppercase tracking-[0.2em] leading-[26px]">
          {frame.map((n, i) => (
            <div
              key={i}
              className={`w-full text-center ${
                i === 2 ? "text-[var(--color-ink)]" : "opacity-40"
              }`}
              style={{
                fontWeight: i === 2 ? 600 : 400,
              }}
            >
              {n}
            </div>
          ))}
        </div>
      </div>
      <div className="border-t border-[color:var(--color-line)] p-2">
        <Button
          variant="accent"
          onClick={onStop}
          disabled={!running}
          className="w-full"
        >
          {stopLabel}
        </Button>
      </div>
    </div>
  );
}

/* =========================================================================
 *                            GAME 1 — SNAKE DRAFT
 * ========================================================================= */

type DraftTeam = {
  [K in DraftSlot]?: { value: string | number | string[]; from: Pokemon };
};

type DraftPhase = "idle" | "rolling" | "choosing" | "done";

function computeTeamTotal(team: DraftTeam): number {
  let t = 0;
  for (const k of STAT_KEYS) {
    const v = team[k]?.value;
    if (typeof v === "number") t += v;
  }
  return t;
}

function SnakeDraft({ mode }: { mode: "pvp" | "boss" }) {
  const { randomPokemon, randomBoss } = usePoke();

  const [p1, setP1] = useState<DraftTeam>({});
  const [p2, setP2] = useState<DraftTeam>({});
  const [pickIndex, setPickIndex] = useState(0); // 0..15
  const [phase, setPhase] = useState<DraftPhase>("idle");
  const [current, setCurrent] = useState<Pokemon | null>(null);
  const [loading, setLoading] = useState(false);
  const [boss, setBoss] = useState<Pokemon | null>(null);
  const [bossTeam, setBossTeam] = useState<DraftTeam>({});

  const activePlayer = SNAKE_ORDER[pickIndex] ?? 1;
  const totalPicks = mode === "pvp" ? 16 : 8;
  const remainingSlots = (team: DraftTeam): DraftSlot[] =>
    DRAFT_SLOTS.filter((s) => team[s] === undefined);

  const begin = useCallback(async () => {
    setLoading(true);
    setP1({});
    setP2({});
    setPickIndex(0);
    setPhase("rolling");
    setCurrent(null);

    if (mode === "boss") {
      const b = await randomBoss();
      if (b) {
        setBoss(b);
        const bTeam: DraftTeam = {
          typing: { value: b.types, from: b },
          ability: { value: b.abilities[0] ?? "—", from: b },
          hp: { value: b.stats.hp, from: b },
          atk: { value: b.stats.atk, from: b },
          def: { value: b.stats.def, from: b },
          spa: { value: b.stats.spa, from: b },
          spd: { value: b.stats.spd, from: b },
          spe: { value: b.stats.spe, from: b },
        };
        setBossTeam(bTeam);
      }
    }

    const first = await randomPokemon();
    setCurrent(first);
    setLoading(false);
  }, [mode, randomBoss, randomPokemon]);

  const rerollAndAdvance = useCallback(
    async (nextPickIndex: number) => {
      setPickIndex(nextPickIndex);
      setPhase("rolling");
      setLoading(true);
      const next = await randomPokemon();
      setCurrent(next);
      setLoading(false);
    },
    [randomPokemon],
  );

  const stopReel = useCallback(() => {
    if (phase !== "rolling" || !current) return;
    setPhase("choosing");
  }, [phase, current]);

  const pickSlot = useCallback(
    (slot: DraftSlot) => {
      if (phase !== "choosing" || !current) return;
      const team = mode === "pvp" && activePlayer === 2 ? p2 : p1;
      if (team[slot] !== undefined) return;

      const value =
        slot === "typing"
          ? current.types
          : slot === "ability"
          ? current.abilities[0] ?? "—"
          : current.stats[slot as StatKey];

      const next: DraftTeam = { ...team, [slot]: { value, from: current } };

      if (mode === "pvp") {
        if (activePlayer === 1) setP1(next);
        else setP2(next);
      } else {
        setP1(next);
      }

      const newIndex = pickIndex + 1;
      if (newIndex >= totalPicks) {
        setPhase("done");
        setPickIndex(newIndex);
      } else {
        rerollAndAdvance(newIndex);
      }
    },
    [
      phase,
      current,
      mode,
      activePlayer,
      p1,
      p2,
      pickIndex,
      totalPicks,
      rerollAndAdvance,
    ],
  );

  const reset = useCallback(() => {
    setP1({});
    setP2({});
    setPickIndex(0);
    setPhase("idle");
    setCurrent(null);
    setBoss(null);
    setBossTeam({});
  }, []);

  const p1Total = computeTeamTotal(p1);
  const p2Total = mode === "pvp" ? computeTeamTotal(p2) : computeTeamTotal(bossTeam);
  const winner =
    phase === "done"
      ? p1Total === p2Total
        ? "draw"
        : p1Total > p2Total
        ? 1
        : 2
      : null;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-[18px] uppercase tracking-[0.3em]">
            {mode === "pvp" ? "SNAKE DRAFT // BUILD TO BEAT MINE" : "BOSS RUSH // BEAT THE LEGEND"}
          </h2>
          <p className="text-[11px] opacity-60 mt-1 uppercase tracking-[0.2em]">
            {mode === "pvp"
              ? "two trainers. 16 picks. snake order 1-2-2-1."
              : "solo run. 8 picks. match the legend."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {phase === "idle" ? (
            <Button variant="accent" onClick={begin} disabled={loading}>
              {loading ? "BOOTING…" : "START DRAFT"}
            </Button>
          ) : (
            <Button onClick={reset}>RESET</Button>
          )}
        </div>
      </header>

      {/* TURN INDICATOR */}
      <div className={`${LINE} px-4 py-2 flex items-center justify-between text-[11px] uppercase tracking-[0.25em]`}>
        <span>
          PICK {String(Math.min(pickIndex + 1, totalPicks)).padStart(2, "0")} /{" "}
          {totalPicks}
        </span>
        <span>
          TURN&nbsp;
          <span
            className={`inline-block px-2 py-[2px] border ${
              phase === "idle" || phase === "done"
                ? "opacity-50"
                : activePlayer === 1
                ? "bg-[var(--color-accent)] text-[var(--color-paper)] border-[color:var(--color-accent)]"
                : mode === "pvp"
                ? "bg-[var(--color-ink)] text-[var(--color-paper)]"
                : "opacity-60"
            }`}
          >
            {phase === "idle"
              ? "STANDBY"
              : phase === "done"
              ? "FINAL"
              : mode === "pvp"
              ? `P${activePlayer}`
              : "YOU"}
          </span>
        </span>
        <span>
          PHASE&nbsp;<span className="opacity-60">{phase.toUpperCase()}</span>
        </span>
      </div>

      {/* MAIN 3-PANE */}
      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-0 border border-[color:var(--color-line)]">
        {/* LEFT — PLAYER 1 */}
        <TeamPane
          title={mode === "pvp" ? "PLAYER 01" : "YOU"}
          team={p1}
          total={p1Total}
          highlight={phase === "choosing" && activePlayer === 1}
          onPick={activePlayer === 1 ? pickSlot : undefined}
          current={current}
          mode={mode}
        />

        <div className="hidden md:block w-px bg-[var(--color-line)]" />

        {/* CENTER — REEL + CURRENT */}
        <div className="flex flex-col items-stretch gap-4 p-4 border-t md:border-t-0 md:border-x border-[color:var(--color-line)] bg-grid">
          <div className="flex items-start gap-4 justify-center">
            <SlotReel running={phase === "rolling"} onStop={stopReel} />
            <div className="flex flex-col gap-2 items-center">
              <Sprite pokemon={current} size={140} />
              <div className="text-[11px] uppercase tracking-[0.22em] text-center">
                {current?.name ?? (loading ? "loading…" : "—")}
              </div>
              {current && (
                <div className="flex flex-wrap gap-1 justify-center max-w-[160px]">
                  {current.types.map((t) => (
                    <TypeChip key={t} type={t} />
                  ))}
                </div>
              )}
            </div>
          </div>

          {phase === "choosing" && current && (
            <div className={`${LINE} p-3 bg-[var(--color-paper)]`}>
              <div className="text-[10px] uppercase tracking-[0.25em] opacity-60 mb-2">
                {mode === "pvp" ? `PLAYER ${activePlayer}` : "YOU"} → PICK AN
                ATTRIBUTE
              </div>
              <div className="grid grid-cols-4 gap-2">
                {DRAFT_SLOTS.map((slot) => {
                  const team = mode === "pvp" && activePlayer === 2 ? p2 : p1;
                  const taken = team[slot] !== undefined;
                  const v =
                    slot === "typing"
                      ? current.types.join("/")
                      : slot === "ability"
                      ? current.abilities[0] ?? "—"
                      : String(current.stats[slot as StatKey]);
                  return (
                    <button
                      key={slot}
                      onClick={() => pickSlot(slot)}
                      disabled={taken}
                      className={`${LINE} px-2 py-2 text-left hover:bg-[var(--color-ink)] hover:text-[var(--color-paper)] transition-colors duration-100 ease-linear disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-inherit`}
                    >
                      <div className="text-[9px] uppercase tracking-[0.22em] opacity-60">
                        {SLOT_LABEL[slot]}
                      </div>
                      <div className="text-[11px] uppercase tracking-[0.15em] truncate">
                        {v}
                      </div>
                    </button>
                  );
                })}
              </div>
              <div className="mt-2 text-[10px] opacity-60 uppercase tracking-[0.2em]">
                {remainingSlots(
                  mode === "pvp" && activePlayer === 2 ? p2 : p1,
                ).length}{" "}
                SLOTS LEFT
              </div>
            </div>
          )}
        </div>

        <div className="hidden md:block w-px bg-[var(--color-line)]" />

        {/* RIGHT — PLAYER 2 / BOSS */}
        <TeamPane
          title={mode === "pvp" ? "PLAYER 02" : boss ? `BOSS // ${boss.name.toUpperCase()}` : "BOSS"}
          team={mode === "pvp" ? p2 : bossTeam}
          total={p2Total}
          highlight={mode === "pvp" && phase === "choosing" && activePlayer === 2}
          onPick={mode === "pvp" && activePlayer === 2 ? pickSlot : undefined}
          current={mode === "pvp" ? current : null}
          mode={mode}
          boss={mode === "boss" ? boss : null}
        />
      </div>

      {/* RESULT OVERLAY */}
      <AnimatePresence>
        {phase === "done" && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18, ease: "linear" }}
            className="fixed inset-0 z-40 flex items-center justify-center bg-[var(--color-paper)]/90"
          >
            <motion.div
              initial={{ clipPath: "inset(50% 0 50% 0)" }}
              animate={{ clipPath: "inset(0% 0 0% 0)" }}
              transition={{ duration: 0.25, ease: "linear" }}
              className={`${LINE} bg-[var(--color-paper)] w-[min(560px,92vw)] p-8`}
            >
              <div className="text-[10px] uppercase tracking-[0.3em] opacity-60 mb-2">
                {"// FINAL TALLY"}
              </div>
              <div className="text-[28px] leading-none uppercase tracking-[0.18em] mb-6">
                {winner === "draw"
                  ? "DRAW"
                  : mode === "pvp"
                  ? `PLAYER ${winner} WINS`
                  : winner === 1
                  ? "YOU BEAT THE LEGEND"
                  : "THE LEGEND HOLDS"}
              </div>
              <div className="grid grid-cols-2 gap-4 text-[12px] uppercase tracking-[0.2em]">
                <div className={`${LINE} p-3`}>
                  <div className="opacity-60 text-[10px] mb-1">
                    {mode === "pvp" ? "P1" : "YOU"}
                  </div>
                  <div className="text-[24px]">{p1Total}</div>
                </div>
                <div className={`${LINE} p-3`}>
                  <div className="opacity-60 text-[10px] mb-1">
                    {mode === "pvp" ? "P2" : "BOSS"}
                  </div>
                  <div className="text-[24px]">{p2Total}</div>
                </div>
              </div>
              <div className="mt-6 flex gap-2 justify-end">
                <Button onClick={reset}>CLOSE</Button>
                <Button variant="accent" onClick={begin}>
                  RUN IT BACK
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const TeamPane = memo(function TeamPane({
  title,
  team,
  total,
  highlight,
  onPick,
  current,
  mode,
  boss,
}: {
  title: string;
  team: DraftTeam;
  total: number;
  highlight?: boolean;
  onPick?: (slot: DraftSlot) => void;
  current: Pokemon | null;
  mode: "pvp" | "boss";
  boss?: Pokemon | null;
}) {
  void current;
  void onPick;
  return (
    <div
      className={`p-4 flex flex-col gap-3 ${
        highlight ? "bg-[var(--color-ink)] text-[var(--color-paper)]" : ""
      }`}
    >
      <div className="flex items-center justify-between">
        <h3 className="text-[12px] uppercase tracking-[0.3em]">{title}</h3>
        <div className="text-[10px] uppercase tracking-[0.25em] opacity-60">
          TOTAL <span className="opacity-100">{total}</span>
        </div>
      </div>

      {mode === "boss" && boss && (
        <div className="flex items-center gap-3">
          <Sprite pokemon={boss} size={88} />
          <div className="flex flex-col gap-1">
            <div className="text-[11px] uppercase tracking-[0.2em]">
              {boss.name}
            </div>
            <div className="flex gap-1 flex-wrap">
              {boss.types.map((t) => (
                <TypeChip key={t} type={t} />
              ))}
            </div>
            <div className="text-[10px] opacity-60 uppercase tracking-[0.22em]">
              BST {boss.stats.total}
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col">
        {DRAFT_SLOTS.map((slot) => {
          const cell = team[slot];
          return (
            <div
              key={slot}
              className="flex items-center justify-between gap-2 py-1.5 border-b border-dashed border-[color:currentColor] opacity-100 last:border-b-0"
              style={{ borderColor: "currentColor", opacity: cell ? 1 : 0.5 }}
            >
              <span className="text-[10px] uppercase tracking-[0.22em] w-14 opacity-70">
                {SLOT_LABEL[slot]}
              </span>
              <span className="text-[11px] uppercase tracking-[0.14em] flex-1 text-right">
                {cell
                  ? Array.isArray(cell.value)
                    ? cell.value.join("/")
                    : String(cell.value)
                  : "—"}
              </span>
              <span className="text-[9px] opacity-50 tracking-[0.2em] w-24 truncate text-right">
                {cell ? `↳ ${cell.from.name}` : ""}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
});

/* =========================================================================
 *                          GAME 3 — HIGHER OR LOWER
 * ========================================================================= */

function valueFor(p: Pokemon, c: HLCategory): number {
  return c === "weight"
    ? p.weight
    : c === "height"
    ? p.height
    : c === "id"
    ? p.id
    : p.stats[c];
}

function HigherLower() {
  const { randomPokemon } = usePoke();
  const [a, setA] = useState<Pokemon | null>(null);
  const [b, setB] = useState<Pokemon | null>(null);
  const [cat, setCat] = useState<HLCategory>("hp");
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [reveal, setReveal] = useState<null | "win" | "lose">(null);
  const [loading, setLoading] = useState(true);
  const [roundVersion, setRoundVersion] = useState(0);
  const carryRef = useRef<Pokemon | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const carryA = carryRef.current;
      carryRef.current = null;
      const newCat =
        HL_CATEGORIES[Math.floor(Math.random() * HL_CATEGORIES.length)];
      const left = carryA ?? (await randomPokemon());
      let right: Pokemon | null = null;
      for (let i = 0; i < 8; i++) {
        const cand = await randomPokemon({
          excludeIds: new Set(left ? [left.id] : []),
        });
        if (!cand) continue;
        if (left && valueFor(cand, newCat) === valueFor(left, newCat))
          continue;
        right = cand;
        break;
      }
      if (!alive) return;
      setCat(newCat);
      setA(left);
      setB(right);
      setReveal(null);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [randomPokemon, roundVersion]);

  const guess = (dir: "higher" | "lower") => {
    if (!a || !b || reveal || loading) return;
    const av = valueFor(a, cat);
    const bv = valueFor(b, cat);
    const correct = dir === "higher" ? bv > av : bv < av;
    if (correct) {
      const nextScore = score + 1;
      setScore(nextScore);
      setBest((x) => Math.max(x, nextScore));
      setReveal("win");
      window.setTimeout(() => {
        carryRef.current = b;
        setLoading(true);
        setA(b);
        setB(null);
        setRoundVersion((v) => v + 1);
      }, 900);
    } else {
      setReveal("lose");
      setBest((x) => Math.max(x, score));
    }
  };

  const hardReset = () => {
    carryRef.current = null;
    setScore(0);
    setA(null);
    setB(null);
    setReveal(null);
    setLoading(true);
    setRoundVersion((v) => v + 1);
  };

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-[18px] uppercase tracking-[0.3em]">
            {"HIGHER / LOWER // STAT DUEL"}
          </h2>
          <p className="text-[11px] opacity-60 mt-1 uppercase tracking-[0.2em]">
            pick a side. category rotates per round.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className={`${LINE} px-3 py-2 text-[11px] uppercase tracking-[0.22em]`}>
            STREAK <span className="ml-2">{score}</span>
          </div>
          <div className={`${LINE} px-3 py-2 text-[11px] uppercase tracking-[0.22em]`}>
            BEST <span className="ml-2">{best}</span>
          </div>
          <Button onClick={hardReset}>RESET</Button>
        </div>
      </header>

      <div className={`${LINE} px-4 py-2 flex items-center justify-between text-[11px] uppercase tracking-[0.25em]`}>
        <span>CATEGORY</span>
        <span className="text-[var(--color-accent)]">{HL_LABEL[cat]}</span>
        <span className="opacity-60">
          {reveal === "lose"
            ? "INCORRECT // GAME OVER"
            : reveal === "win"
            ? "CORRECT"
            : loading
            ? "DEALING…"
            : "AWAITING GUESS"}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-0 border border-[color:var(--color-line)]">
        <HLCard p={a} cat={cat} revealValue label="A" />
        <div className="hidden md:flex items-center justify-center w-px bg-[var(--color-line)]" />
        <HLCard
          p={b}
          cat={cat}
          revealValue={reveal !== null}
          label="B"
          actions={
            <div className="grid grid-cols-2 gap-2 w-full">
              <Button
                onClick={() => guess("higher")}
                disabled={!b || reveal !== null || loading}
                variant="accent"
              >
                HIGHER
              </Button>
              <Button
                onClick={() => guess("lower")}
                disabled={!b || reveal !== null || loading}
              >
                LOWER
              </Button>
            </div>
          }
        />
      </div>

      <AnimatePresence>
        {reveal === "lose" && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15, ease: "linear" }}
            className="fixed inset-0 z-40 flex items-center justify-center bg-[var(--color-paper)]/90"
          >
            <motion.div
              initial={{ clipPath: "inset(50% 0 50% 0)" }}
              animate={{ clipPath: "inset(0% 0 0% 0)" }}
              transition={{ duration: 0.2, ease: "linear" }}
              className={`${LINE} bg-[var(--color-paper)] w-[min(480px,92vw)] p-8`}
            >
              <div className="text-[10px] uppercase tracking-[0.3em] opacity-60 mb-2">
                {"// GAME OVER"}
              </div>
              <div className="text-[24px] uppercase tracking-[0.18em] mb-4">
                STREAK {score}
              </div>
              <div className="text-[11px] uppercase tracking-[0.22em] opacity-60 mb-6">
                BEST RUN {best}
              </div>
              <div className="flex justify-end">
                <Button variant="accent" onClick={hardReset}>
                  NEW RUN
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function HLCard({
  p,
  cat,
  revealValue,
  label,
  actions,
}: {
  p: Pokemon | null;
  cat: HLCategory;
  revealValue: boolean;
  label: string;
  actions?: React.ReactNode;
}) {
  const val = p
    ? cat === "weight"
      ? p.weight
      : cat === "height"
      ? p.height
      : cat === "id"
      ? p.id
      : p.stats[cat]
    : null;

  return (
    <div className="p-5 flex flex-col items-center gap-3 min-h-[280px]">
      <div className="w-full flex items-center justify-between text-[10px] uppercase tracking-[0.3em] opacity-60">
        <span>SUBJECT {label}</span>
        <span>{p ? `#${String(p.id).padStart(4, "0")}` : "----"}</span>
      </div>
      <Sprite pokemon={p} size={160} />
      <div className="text-[13px] uppercase tracking-[0.22em]">
        {p?.name ?? "—"}
      </div>
      {p && (
        <div className="flex gap-1 flex-wrap justify-center">
          {p.types.map((t) => (
            <TypeChip key={t} type={t} />
          ))}
        </div>
      )}
      <div className="w-full mt-1 relative overflow-hidden h-10 border border-[color:var(--color-line)]">
        <div className="absolute inset-0 flex items-center justify-center text-[10px] uppercase tracking-[0.3em] opacity-60">
          {HL_LABEL[cat]}
        </div>
        <AnimatePresence>
          {revealValue && val !== null && (
            <motion.div
              key={`${p?.id}-${cat}-${val}`}
              initial={{ y: "100%" }}
              animate={{ y: "0%" }}
              exit={{ y: "-100%" }}
              transition={{ duration: 0.25, ease: "linear" }}
              className="absolute inset-0 bg-[var(--color-ink)] text-[var(--color-paper)] flex items-center justify-center text-[18px] tracking-[0.15em]"
            >
              {val}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      {actions && <div className="w-full mt-2">{actions}</div>}
    </div>
  );
}

/* =========================================================================
 *                          GAME 4 — TYPE ROULETTE
 * ========================================================================= */

function sameTypeSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = new Set(a);
  for (const t of b) if (!sa.has(t)) return false;
  return true;
}

function TypeRoulette() {
  const { byName, gen } = usePoke();
  const [types, setTypes] = useState<[string, string]>(["fire", "water"]);
  const [hearts, setHearts] = useState(3);
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [guess, setGuess] = useState("");
  const [feedback, setFeedback] = useState<null | {
    ok: boolean;
    msg: string;
    found?: Pokemon;
  }>(null);
  const [submitting, setSubmitting] = useState(false);
  const [spinning, setSpinning] = useState(true);
  const [spinVersion, setSpinVersion] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let ticks = 0;
    const target = 14 + Math.floor(Math.random() * 6);
    const interval = window.setInterval(() => {
      ticks += 1;
      const t1 = ALL_TYPES[Math.floor(Math.random() * ALL_TYPES.length)];
      let t2 = ALL_TYPES[Math.floor(Math.random() * ALL_TYPES.length)];
      while (t2 === t1) {
        t2 = ALL_TYPES[Math.floor(Math.random() * ALL_TYPES.length)];
      }
      setTypes([t1, t2]);
      if (ticks >= target) {
        window.clearInterval(interval);
        setSpinning(false);
        inputRef.current?.focus();
      }
    }, 70);
    return () => window.clearInterval(interval);
  }, [spinVersion]);

  const triggerSpin = useCallback(() => {
    setSpinning(true);
    setFeedback(null);
    setGuess("");
    setSpinVersion((v) => v + 1);
  }, []);

  const inGenRange = (p: Pokemon) => {
    const [lo, hi] = genRange(gen);
    return p.id >= lo && p.id <= hi;
  };

  const submit = async () => {
    if (submitting || spinning || hearts <= 0) return;
    const clean = guess.trim().toLowerCase().replace(/\s+/g, "-");
    if (!clean) return;
    setSubmitting(true);
    const p = await byName(clean);
    if (!p) {
      setFeedback({ ok: false, msg: "NO SUCH POKéMON" });
      setHearts((h) => Math.max(0, h - 1));
      setSubmitting(false);
      return;
    }
    if (!inGenRange(p)) {
      setFeedback({
        ok: false,
        msg: `OUT OF GEN RANGE (#${p.id})`,
        found: p,
      });
      setHearts((h) => Math.max(0, h - 1));
      setSubmitting(false);
      return;
    }
    if (!sameTypeSet(p.types, types)) {
      setFeedback({
        ok: false,
        msg: `TYPES DO NOT MATCH → ${p.types.join("/")}`,
        found: p,
      });
      setHearts((h) => Math.max(0, h - 1));
      setSubmitting(false);
      return;
    }
    setFeedback({ ok: true, msg: "MATCH LOCKED", found: p });
    const nextScore = score + 1;
    setScore(nextScore);
    setBest((x) => Math.max(x, nextScore));
    setSubmitting(false);
    window.setTimeout(() => {
      triggerSpin();
    }, 900);
  };

  const reset = () => {
    setHearts(3);
    setScore(0);
    triggerSpin();
  };

  const gameOver = hearts <= 0;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-[18px] uppercase tracking-[0.3em]">
            {"TYPE ROULETTE // DUAL-TYPE RECALL"}
          </h2>
          <p className="text-[11px] opacity-60 mt-1 uppercase tracking-[0.2em]">
            name a pokémon with exactly both types.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className={`${LINE} px-3 py-2 text-[11px] uppercase tracking-[0.22em]`}>
            STREAK <span className="ml-2">{score}</span>
          </div>
          <div className={`${LINE} px-3 py-2 text-[11px] uppercase tracking-[0.22em]`}>
            BEST <span className="ml-2">{best}</span>
          </div>
          <Button onClick={reset}>RESET</Button>
        </div>
      </header>

      <div
        className={`${LINE} p-6 flex flex-col gap-5 bg-grid`}
      >
        <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.3em] opacity-60">
          <span>ROLL</span>
          <span>REQUIRED DUAL TYPE</span>
          <div className="flex gap-2 items-center">
            {[0, 1, 2].map((i) => (
              <Heart key={i} filled={hearts > i} />
            ))}
          </div>
        </div>

        <div className="flex items-center justify-center gap-6">
          <TypeTile type={types[0]} spinning={spinning} />
          <span className="text-[22px] opacity-40">×</span>
          <TypeTile type={types[1]} spinning={spinning} />
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="flex items-stretch gap-0"
        >
          <input
            ref={inputRef}
            value={guess}
            onChange={(e) => setGuess(e.target.value)}
            placeholder="ENTER POKéMON NAME…"
            disabled={spinning || gameOver}
            className={`flex-1 px-4 py-3 border border-r-0 ${LINE} bg-[var(--color-paper)] text-[13px] uppercase tracking-[0.18em] outline-none placeholder:opacity-40`}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
          <Button
            type="submit"
            variant="accent"
            disabled={submitting || spinning || gameOver || !guess.trim()}
            className="px-6"
          >
            {submitting ? "…" : "LOCK"}
          </Button>
        </form>

        <AnimatePresence mode="wait">
          {feedback && (
            <motion.div
              key={feedback.msg + (feedback.found?.id ?? "")}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12, ease: "linear" }}
              className={`${LINE} px-4 py-3 flex items-center gap-3 text-[11px] uppercase tracking-[0.22em] ${
                feedback.ok
                  ? "bg-[var(--color-ink)] text-[var(--color-paper)]"
                  : "bg-[var(--color-paper)]"
              }`}
            >
              {feedback.found && (
                <div className="w-10 h-10 shrink-0">
                  <Sprite pokemon={feedback.found} size={40} />
                </div>
              )}
              <span>{feedback.msg}</span>
              {feedback.found && (
                <span className="ml-auto opacity-70">
                  {feedback.found.name}
                </span>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {gameOver && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15, ease: "linear" }}
            className="fixed inset-0 z-40 flex items-center justify-center bg-[var(--color-paper)]/90"
          >
            <motion.div
              initial={{ clipPath: "inset(50% 0 50% 0)" }}
              animate={{ clipPath: "inset(0% 0 0% 0)" }}
              transition={{ duration: 0.22, ease: "linear" }}
              className={`${LINE} bg-[var(--color-paper)] w-[min(480px,92vw)] p-8`}
            >
              <div className="text-[10px] uppercase tracking-[0.3em] opacity-60 mb-2">
                {"// OUT OF HEARTS"}
              </div>
              <div className="text-[24px] uppercase tracking-[0.18em] mb-2">
                STREAK {score}
              </div>
              <div className="text-[11px] opacity-60 uppercase tracking-[0.22em] mb-6">
                BEST {best}
              </div>
              <div className="flex justify-end">
                <Button variant="accent" onClick={reset}>
                  RETRY
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function TypeTile({ type, spinning }: { type: string; spinning: boolean }) {
  return (
    <div
      className={`${LINE} w-[140px] h-[80px] flex items-center justify-center uppercase tracking-[0.22em] text-[14px] bg-[var(--color-paper)] relative overflow-hidden`}
    >
      <AnimatePresence mode="popLayout">
        <motion.span
          key={type}
          initial={{ y: spinning ? "100%" : 0, opacity: spinning ? 0 : 1 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: "-100%", opacity: 0 }}
          transition={{ duration: 0.06, ease: "linear" }}
        >
          {type}
        </motion.span>
      </AnimatePresence>
    </div>
  );
}

/* =========================================================================
 *                                 SHELL
 * ========================================================================= */

function GenFilterBar({
  gen,
  setGen,
}: {
  gen: GenKey;
  setGen: (g: GenKey) => void;
}) {
  const keys: GenKey[] = ["all", 1, 2, 3, 4, 5, 6, 7, 8, 9];
  return (
    <div className={`flex items-stretch border ${LINE}`}>
      <div className="px-3 py-2 text-[10px] uppercase tracking-[0.3em] border-r border-[color:var(--color-line)] opacity-70">
        GEN FILTER
      </div>
      <div className="flex">
        {keys.map((k) => {
          const active = gen === k;
          return (
            <button
              key={String(k)}
              onClick={() => setGen(k)}
              className={`px-3 text-[11px] uppercase tracking-[0.22em] border-r border-[color:var(--color-line)] last:border-r-0 ${
                active
                  ? "bg-[var(--color-accent)] text-[var(--color-paper)]"
                  : "hover:bg-[var(--color-ink)] hover:text-[var(--color-paper)] transition-colors duration-100 ease-linear"
              }`}
              aria-pressed={active}
            >
              {GEN_LABELS[k]}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function NavBar({
  active,
  setActive,
}: {
  active: GameId;
  setActive: (g: GameId) => void;
}) {
  const tabs: { id: GameId; label: string }[] = [
    { id: "DRAFT", label: "[ DRAFT ]" },
    { id: "BOSS", label: "[ BOSS ]" },
    { id: "STATS", label: "[ STATS ]" },
    { id: "TYPES", label: "[ TYPES ]" },
  ];
  return (
    <nav
      className={`sticky top-0 z-30 bg-[var(--color-paper)] border-b border-[color:var(--color-line)]`}
    >
      <div className="max-w-[1280px] mx-auto px-4 md:px-6 py-3 flex items-center justify-between gap-6">
        <div className="flex items-center gap-3">
          <div className={`w-3 h-3 bg-[var(--color-accent)]`} />
          <span className="text-[12px] uppercase tracking-[0.35em]">
            TRAINER · PLAYGROUND
          </span>
          <span className="hidden md:inline text-[10px] opacity-50 tracking-[0.25em] ml-3">
            {"// POKéMON TREND ENGINE"}
          </span>
        </div>
        <div className="flex items-center gap-1 flex-wrap">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setActive(t.id)}
              className={`px-3 py-1.5 text-[12px] uppercase tracking-[0.22em] border ${
                active === t.id
                  ? "border-[color:var(--color-accent)] text-[var(--color-accent)]"
                  : "border-transparent hover:border-[color:var(--color-line)]"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
    </nav>
  );
}

function Footer() {
  return (
    <footer className="mt-10 border-t border-[color:var(--color-line)]">
      <div className="max-w-[1280px] mx-auto px-4 md:px-6 py-4 flex items-center justify-between text-[10px] uppercase tracking-[0.28em] opacity-60">
        <span>{"DATA // POKEAPI.CO"}</span>
        <span>BUILD · 01 · {new Date().getFullYear()}</span>
        <span className="hidden md:inline">
          POWERED BY NEXT · TAILWIND · FRAMER
        </span>
      </div>
    </footer>
  );
}

export default function Playground() {
  const [gen, setGen] = useState<GenKey>("all");
  const [active, setActive] = useState<GameId>("DRAFT");

  const randomPokemonCtx = useCallback(
    (opts?: { excludeIds?: Set<number> }) =>
      fetchRandomPokemon(gen, opts),
    [gen],
  );
  const randomBossCtx = useCallback(() => fetchRandomBoss(gen), [gen]);
  const byIdCtx = useCallback((id: number) => fetchPokemonRaw(id), []);
  const byNameCtx = useCallback((name: string) => fetchPokemonRaw(name), []);

  const ctx: PokeAPIContextValue = useMemo(
    () => ({
      gen,
      setGen,
      randomPokemon: randomPokemonCtx,
      randomBoss: randomBossCtx,
      byId: byIdCtx,
      byName: byNameCtx,
    }),
    [gen, randomPokemonCtx, randomBossCtx, byIdCtx, byNameCtx],
  );

  return (
    <PokeAPIContext.Provider value={ctx}>
      <div className="min-h-screen flex flex-col">
        <NavBar active={active} setActive={setActive} />

        <main className="max-w-[1280px] w-full mx-auto px-4 md:px-6 py-6 flex-1 flex flex-col gap-6">
          {/* HUD BAR */}
          <div className="flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
            <GenFilterBar gen={gen} setGen={setGen} />
            <div className="flex items-center gap-3">
              <div className={`${LINE} px-3 py-2 text-[10px] uppercase tracking-[0.28em]`}>
                MODE <span className="ml-2 text-[var(--color-accent)]">{active}</span>
              </div>
              <div className={`${LINE} px-3 py-2 text-[10px] uppercase tracking-[0.28em] opacity-70`}>
                RANGE&nbsp;
                {gen === "all"
                  ? "001–1025"
                  : `${String(GEN_RANGES[gen][0]).padStart(3, "0")}–${String(
                      GEN_RANGES[gen][1],
                    ).padStart(3, "0")}`}
              </div>
            </div>
          </div>

          <div className="flex-1">
            <AnimatePresence mode="wait">
              <motion.div
                key={active + String(gen)}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.12, ease: "linear" }}
              >
                {active === "DRAFT" && (
                  <SnakeDraft key={`draft-${gen}`} mode="pvp" />
                )}
                {active === "BOSS" && (
                  <SnakeDraft key={`boss-${gen}`} mode="boss" />
                )}
                {active === "STATS" && <HigherLower key={`stats-${gen}`} />}
                {active === "TYPES" && <TypeRoulette key={`types-${gen}`} />}
              </motion.div>
            </AnimatePresence>
          </div>
        </main>

        <Footer />
      </div>
    </PokeAPIContext.Provider>
  );
}
