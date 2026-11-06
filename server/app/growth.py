from . import config

CURVE = 0.4  # ease-out exponent: fast visible growth at the start, slower towards the flower

STAGES = ["seed", "sprout", "sprout", "leaves", "leaves", "leaves", "leaves", "bud", "bud", "bud", "bud", "bud", "flower"]
SPECIES = {"youtube": "sunflower", "text": "fern", "web": "cactus"}


def growth(focused_seconds: float) -> dict:
    """Plant growth from focused time (computed on the server, never trusted from the client).

    Full bloom = BLOOM_LEVEL * STEP_SECONDS focused seconds (~24 min). The curve is ease-out
    (level = 12 * progress ** 0.4) so growth is visible right away: the seed sprouts in the first
    seconds, ~28% height after 1 focused minute, then it slows down towards the flower."""
    total = config.STEP_SECONDS * config.BLOOM_LEVEL
    blooms = int(focused_seconds // total)
    progress = min(1.0, focused_seconds / total)
    exact = config.BLOOM_LEVEL * progress ** CURVE
    level = min(config.BLOOM_LEVEL, int(exact + 1e-9))
    next_in = None
    if level < config.BLOOM_LEVEL:
        next_in = round(((level + 1) / config.BLOOM_LEVEL) ** (1 / CURVE) * total - focused_seconds, 1)
    return {"focused_seconds": round(focused_seconds, 1), "level": level, "level_exact": round(exact, 3),
            "progress": round(progress, 4), "next_level_in": next_in, "stage": STAGES[level], "blooms": blooms}
