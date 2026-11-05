from . import config

STAGES = ["seed", "sprout", "sprout", "leaves", "leaves", "leaves", "leaves", "bud", "bud", "bud", "bud", "bud", "flower"]
SPECIES = {"youtube": "sunflower", "text": "fern", "web": "cactus"}


def growth(focused_seconds: float) -> dict:
    steps = int(focused_seconds // config.STEP_SECONDS)
    level = min(config.BLOOM_LEVEL, steps)
    return {"focused_seconds": round(focused_seconds, 1), "level": level, "stage": STAGES[level],
            "blooms": steps // config.BLOOM_LEVEL}
