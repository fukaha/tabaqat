from tabaqat.export import _quote


def test_quote_short_text_unchanged():
    assert _quote("قصير.") == "قصير."


def test_quote_cuts_at_sentence_end():
    s = "تفقه على أبي حنيفة وروى عنه. " * 30
    q = _quote(s)
    assert len(q) <= 322 and q.endswith(". …")


def test_quote_drops_footnotes_and_after_rule():
    q = _quote("نص[^1] أول.<hr>حاشية المحقق")
    assert "حاشية" not in q and "[^1]" not in q
