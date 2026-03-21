"""Tests for the _extract_list helper used in threat_analyzer and config_expander."""

from app.services.threat_analyzer import _extract_list


class TestExtractList:
    def test_returns_bare_list(self):
        assert _extract_list([1, 2, 3]) == [1, 2, 3]

    def test_extracts_first_list_from_wrapper_dict(self):
        result = _extract_list({"threats": [{"name": "phishing"}]})
        assert result == [{"name": "phishing"}]

    def test_returns_empty_list_for_non_list_non_dict(self):
        assert _extract_list("hello") == []
        assert _extract_list(42) == []
        assert _extract_list(None) == []

    def test_returns_empty_list_for_dict_with_no_list_values(self):
        assert _extract_list({"key": "value", "count": 5}) == []

    def test_returns_empty_list_for_empty_inputs(self):
        assert _extract_list([]) == []
        assert _extract_list({}) == []

    def test_extracts_first_list_when_multiple_exist(self):
        # Should return the first list value encountered
        result = _extract_list({"a": "not_a_list", "b": [1, 2], "c": [3, 4]})
        assert result == [1, 2]
