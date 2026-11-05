/** Heat strip of v4_2 attention_weights (100 frames = 10 s). Weights are normalized 0..1 by the caller or here. */
export function AttentionStrip({ weights, height = 18 }: { weights: number[]; height?: number }) {
  const max = Math.max(...weights, 1e-9);
  return (
    <svg className="strip" viewBox={`0 0 ${weights.length} 1`} preserveAspectRatio="none" style={{ height }}
      role="img" aria-label="מפת חום של משקלי הקשב">
      {weights.map((w, i) => (
        <rect key={i} x={weights.length - 1 - i} y="0" width="1.05" height="1" fill="var(--leaf)" opacity={0.08 + 0.92 * (w / max)} />
      ))}
    </svg>
  );
}
