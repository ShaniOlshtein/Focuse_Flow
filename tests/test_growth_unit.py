"""Unit tests (no server / DB) for focus-time crediting and plant growth.
Run: python -m pytest tests/test_growth_unit.py"""
import os
import sys
from datetime import datetime, timedelta, timezone

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "server"))
from app import config  # noqa: E402
from app.growth import credited_seconds, growth  # noqa: E402

T0 = datetime(2026, 1, 1, 12, 0, 0, tzinfo=timezone.utc)


def at(sec: float) -> datetime:
    return T0 + timedelta(seconds=sec)


# ---------- credited_seconds: focus time a reading accounts for ----------

def test_first_reading_counts_from_start():
    assert credited_seconds(at(3), T0, None, T0, 0.9) == 3


def test_low_score_credits_nothing():
    assert credited_seconds(at(3), T0, None, T0, 0.2) == 0


@pytest.mark.parametrize("score,expected", [(config.FOCUS_THRESHOLD, 3.0), (config.FOCUS_THRESHOLD - 1e-6, 0.0)])
def test_threshold_boundary(score, expected):
    assert credited_seconds(at(3), T0, None, T0, score) == expected


def test_gap_is_capped():
    assert credited_seconds(at(100), T0, at(1), at(0), 0.9) == config.MAX_READING_GAP


def test_paused_time_not_counted_after_resume():
    # readings until t=10, paused 10..60, resumed at 60, next reading at 63 -> only 3 s
    assert credited_seconds(at(63), T0, at(10), at(60), 0.9) == 3


def test_waiting_for_video_not_counted():
    # session opened at 0, video started at 40, first reading at 43
    assert credited_seconds(at(43), T0, None, at(40), 0.9) == 3


def test_short_pause_also_excluded():
    # previously a 4 s pause (< cap) was fully credited; now only time since resume
    assert credited_seconds(at(14), T0, at(9), at(13), 0.9) == 1


def test_active_since_before_last_reading_uses_last_reading():
    assert credited_seconds(at(13), T0, at(10), at(2), 0.9) == 3


def test_clock_skew_never_negative():
    assert credited_seconds(at(5), T0, at(9), None, 0.9) == 0


def test_legacy_session_without_active_since():
    assert credited_seconds(at(4), T0, at(1), None, 0.9) == 3


# ---------- growth(): plant level from focused seconds ----------

TOTAL = config.STEP_SECONDS * config.BLOOM_LEVEL


def test_growth_zero():
    g = growth(0)
    assert g["level"] == 0 and g["stage"] == "seed" and g["blooms"] == 0 and g["progress"] == 0


def test_growth_monotonic():
    vals = [growth(s)["level_exact"] for s in range(0, int(TOTAL) + 1, 30)]
    assert vals == sorted(vals)


def test_growth_full_bloom_boundary():
    before, full = growth(TOTAL - 0.1), growth(TOTAL)
    assert before["level"] < config.BLOOM_LEVEL and before["blooms"] == 0
    assert full["level"] == config.BLOOM_LEVEL and full["stage"] == "flower" and full["blooms"] == 1
    assert full["next_level_in"] is None


def test_growth_caps_after_bloom():
    g = growth(TOTAL * 2.5)
    assert g["level"] == config.BLOOM_LEVEL and g["progress"] == 1.0 and g["blooms"] == 2


def test_next_level_in_reaches_next_level():
    g = growth(10)
    nxt = growth(10 + g["next_level_in"] + 0.1)
    assert nxt["level"] == g["level"] + 1

