/* Animated SVG plant: seed → sprout → leaves → bud → flower (level 0..12).
   species by content type, flower color by average score, mood by live score. */
export type Species = "sunflower" | "fern" | "cactus";
export type Mood = "grow" | "still" | "droop" | "sleep";

export const STAGE_NAME: Record<string, string> = {
  seed: "זרע",
  sprout: "נבט",
  leaves: "עלים",
  bud: "ניצן",
  flower: "פרח",
};
export const SPECIES_NAME: Record<Species, string> = { sunflower: "חמנייה", fern: "שרך", cactus: "קקטוס" };

/** flower color by average score */
export function flowerColor(avg: number | null | undefined) {
  if (avg == null) return "#e8b4c8";
  if (avg >= 0.7) return "#f2c14e";
  if (avg >= 0.5) return "#ef8a62";
  return "#b39ddb";
}

type Props = {
  level: number;
  species?: Species;
  mood?: Mood;
  color?: string;
  size?: number;
  reviving?: boolean;
  label?: string;
  pot?: boolean;
};

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/** level may be fractional (0..12): the plant grows continuously, not in jumps. */
export default function Plant({ level, species = "sunflower", mood = "still", color = "#f2c14e", size = 160, reviving, label, pot = true }: Props) {
  const lv = Math.max(0, Math.min(12, level));
  const baseY = pot ? 122 : 156;
  // stem: sprouts during the first level, then ~6.5 px per level (up to ~92 px)
  const stemH = lv < 0.15 ? 0 : 18 * clamp01(lv) + Math.max(0, lv - 1) * 6.4;
  const topY = baseY - stemH;
  const droop = mood === "droop";
  const bend = droop ? 16 : 0; // stem bends sideways when thirsty for focus
  const topX = 60 + bend;
  const leafColor = mood === "sleep" ? "#93a58c" : droop ? "#9db57a" : "#6aa35c";
  const stemColor = mood === "sleep" ? "#7f9278" : "#4f7d4a";
  const budGrow = clamp01((lv - 7) / 5); // bud swells from level 7 to 12
  const showFlower = lv >= 12;
  const cls = `plant mood-${mood}${reviving ? " reviving" : ""}${pot ? "" : " natural"}`;

  // leaf k appears at level 1 + 2k and unfolds over ~1.5 levels
  const leaves = Array.from({ length: 5 }, (_, i) => {
    const grow = clamp01((lv - (0.6 + i * 1.7)) / 1.2);
    if (grow <= 0) return null;
    const t = 0.25 + i * 0.14;
    const y = baseY - stemH * Math.min(0.85, t);
    const x = 60 + bend * t * t;
    const side = i % 2 === 0 ? 1 : -1;
    const len = (species === "fern" ? 24 - i * 2 : 19 - i) * (0.35 + 0.65 * grow);
    const rot = droop ? side * 55 : side * 25;
    const d =
      species === "fern"
        ? `M0,0 C${len * 0.4},-6 ${len * 0.8},-5 ${len},0 C${len * 0.8},3 ${len * 0.4},4 0,0`
        : `M0,0 C${len * 0.3},-${len * 0.6} ${len * 0.9},-${len * 0.5} ${len},0 C${len * 0.7},${len * 0.35} ${len * 0.3},${len * 0.3} 0,0`;
    return (
      <path key={i} className="leaf" d={d} fill={leafColor}
        transform={`translate(${x},${y}) scale(${side},1) rotate(${-Math.abs(rot) + (droop ? 70 : 0)})`} />
    );
  });
  const cw = 7 + lv * 0.6; // cactus half width

  return (
    <svg className={cls} width={size} height={size * (4 / 3)} viewBox="0 0 120 160" role="img"
      aria-label={label ?? `צמח בשלב ${Math.floor(lv)}`}>
      {/* soft sun glow behind */}
      <circle cx="60" cy="70" r="46" className="plant-glow" />
      {pot && (
        <>
          <path d="M30,122 L90,122 L84,156 L36,156 Z" fill="var(--pot, #c8664a)" />
          <rect x="26" y="116" width="68" height="10" rx="4" fill="var(--pot-rim, #b35a40)" />
          <ellipse cx="60" cy="118" rx="30" ry="3" fill="#6b4a33" opacity="0.6" />
        </>
      )}
      {/* plant body (drawn over the pot) */}
      <g className="plant-body">
        {lv < 0.6 && (
          <g className="seed" opacity={1 - clamp01((lv - 0.3) / 0.3)}>
            <ellipse cx="60" cy="109" rx="9" ry="7" fill="#d9a86c" stroke="#7a4a22" strokeWidth="1.5" />
            <path d={`M60,102 q3,${-3 - lv * 12} ${4 + lv * 8},${-2 - lv * 8}`} stroke="#6aa35c" strokeWidth="2.5" fill="none" strokeLinecap="round" />
          </g>
        )}
        {stemH > 0 && species !== "cactus" && (
          <path d={`M60,${baseY} Q${60 + bend * 0.2},${baseY - stemH * 0.6} ${topX},${topY}`}
            stroke={stemColor} strokeWidth={2.5 + lv * 0.2} fill="none" strokeLinecap="round" className="stem" />
        )}
        {stemH > 0 && species === "cactus" && (
          <g transform={droop ? `rotate(12 60 ${baseY})` : undefined}>
            <rect x={60 - cw} y={topY} width={cw * 2} height={stemH} rx={cw} fill={leafColor} stroke={stemColor} strokeWidth="2" />
            {lv >= 4 && (
              <path d={`M${60 - cw},${baseY - stemH * 0.45} h-10 v-${(8 + lv) * clamp01(lv - 4)}`} stroke={leafColor}
                strokeWidth="8" fill="none" strokeLinecap="round" />
            )}
            {lv >= 7 && (
              <path d={`M${60 + cw},${baseY - stemH * 0.6} h10 v-${(6 + lv * 0.8) * clamp01(lv - 7)}`} stroke={leafColor}
                strokeWidth="7" fill="none" strokeLinecap="round" />
            )}
          </g>
        )}
        {species !== "cactus" && leaves}
        {budGrow > 0 && !showFlower && (
          <ellipse cx={topX} cy={topY - 4} rx={2.5 + budGrow * 4.5} ry={4 + budGrow * 6} fill={color}
            stroke={stemColor} strokeWidth="1.5" className="bud" />
        )}
        {showFlower && (
          <g className="flower" transform={`translate(${topX},${topY - 6}) rotate(${droop ? 35 : 0})`}>
            {Array.from({ length: species === "sunflower" ? 12 : 6 }, (_, i) => (
              <ellipse key={i} cx="0" cy={species === "sunflower" ? -11 : -8} rx={species === "sunflower" ? 4 : 5}
                ry={species === "sunflower" ? 9 : 7} fill={color}
                transform={`rotate(${((species === "sunflower" ? 30 : 60) * i)})`} />
            ))}
            <circle r={species === "sunflower" ? 7 : 4.5} fill={species === "sunflower" ? "#7a4a22" : "#f6efe1"} />
          </g>
        )}
      </g>
      {mood === "sleep" && (
        <text x="88" y="40" className="zzz" fontSize="14">z<tspan dy="-6" fontSize="11">z</tspan></text>
      )}
    </svg>
  );
}
