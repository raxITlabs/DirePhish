"""Toolsets must be cached so all personas share one MCP subprocess per world."""

import pytest

from adk.agents.personas._shared_toolset import (
    get_slack_toolset, get_email_toolset, get_pagerduty_toolset,
    reset_toolset_cache,
)


@pytest.fixture(autouse=True)
def _clean_cache():
    reset_toolset_cache()
    yield
    reset_toolset_cache()


def test_slack_toolset_is_singleton():
    a = get_slack_toolset()
    b = get_slack_toolset()
    assert a is b, "slack toolset must be cached (same instance each call)"


def test_email_toolset_is_singleton():
    assert get_email_toolset() is get_email_toolset()


def test_pagerduty_toolset_is_singleton():
    assert get_pagerduty_toolset() is get_pagerduty_toolset()


def test_each_world_has_own_toolset():
    assert get_slack_toolset() is not get_email_toolset()
    assert get_email_toolset() is not get_pagerduty_toolset()


def test_reset_cache_clears_singletons():
    first = get_slack_toolset()
    reset_toolset_cache()
    second = get_slack_toolset()
    assert first is not second, "reset must produce a fresh toolset"
