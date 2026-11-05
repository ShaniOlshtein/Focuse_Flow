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
};

export default function Plant({ level, species = "sunflower", mood = "still", color = "#f2c14e", size = 160, reviving, label }: Props) {
  const lv = Math.max(0, Math.min(12, Math.round(level)));
  const stemH = lv === 0 ? 0 : 14 + lv * 6.5; // up to ~92px
  const baseY = 122;
  const topY = baseY - stemH;
  const droop = mood === "droop";
  const bend = droop ? 16 : 0; // stem bends sideways when thirsty for focus
  const topX = 60 + bend;
  const leafPairs = lv < 1 ? 0 : Math.min(5, Math.ceil(lv / 2));
  const leafColor = mood === "sleep" ? "#93a58c" : droop ? "#9db57a" : "#6aa35c";
  const stemColor = mood === "sleep" ? "#7f9278" : "#4f7d4a";
  const showBud = lv >= 7 && lv < 12;
  const showFlower = lv >= 12;
  const cls = `plant mood-${mood}${reviving ? " reviving" : ""}`;

  const leaves = Array.from({ length: leafPairs }, (_, i) => {
    const t = (i + 1) / (leafPairs + 1);
    const y = baseY - stemH * t;
    const x = 60 + bend * t * t;
    const side = i % 2 === 0 ? 1 : -1;
    const len = species === "fern" ? 22 - i * 2 : 16 - i;
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

  return (
    <svg className={cls} width={size} height={size * (4 / 3)} viewBox="0 0 120 160" role="img"
      aria-label={label ?? `צמח בשלב ${lv}`}>
      {/* soft sun glow behind */}
      <circle cx="60" cy="70" r="46" className="plant-glow" />
      {/* pot */}
      <path d="M30,122 L90,122 L84,156 L36,156 Z" fill="var(--pot, #c8664a)" />
      <rect x="26" y="116" width="68" height="10" rx="4" fill="var(--pot-rim, #b35a40)" />
      <ellipse cx="60" cy="118" rx="30" ry="3" fill="#6b4a33" opacity="0.6" />
      {/* plant body (drawn over the pot) */}
      <g className="plant-body">
        {lv === 0 && (
          <g className="seed">
            <ellipse cx="60" cy="109" rx="9" ry="7" fill="#d9a86c" stroke="#7a4a22" strokeWidth="1.5" />
            <path d="M60,102 q3,-7 8,-6" stroke="#6aa35c" strokeWidth="2.5" fill="none" strokeLinecap="round" />
          </g>
        )}
        {lv > 0 && species !== "cactus" && (
          <path d={`M60,${baseY} Q${60 + bend * 0.2},${baseY - stemH * 0.6} ${topX},${topY}`}
            stroke={stemColor} strokeWidth={3 + lv * 0.15} fill="none" strokeLinecap="round" className="stem" />
        )}
        {lv > 0 && species === "cactus" && (
          <g transform={droop ? `rotate(12 60 ${baseY})` : undefined}>
            <rect x={60 - (7 + lv * 0.6)} y={topY} width={14 + lv * 1.2} height={stemH} rx={7 + lv * 0.6}
              fill={leafColor} stroke={stemColor} strokeWidth="2" />
            {lv >= 5 && (
              <path d={`M${60 - 7 - lv * 0.6},${baseY - stemH * 0.45} h-10 v-${8 + lv} `} stroke={leafColor}
                strokeWidth="8" fill="none" strokeLinecap="round" />
            )}
            {lv >= 8 && (
              <path d={`M${60 + 7 + lv * 0.6},${baseY - stemH * 0.6} h10 v-${6 + lv * 0.8}`} stroke={leafColor}
                strokeWidth="7" fill="none" strokeLinecap="round" />
            )}
          </g>
        )}
        {species !== "cactus" && leaves}
        {showBud && (
          <ellipse cx={topX} cy={topY - 4} rx={3 + (lv - 7) * 0.8} ry={5 + (lv - 7) * 1.1} fill={color}
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
