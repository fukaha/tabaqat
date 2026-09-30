from tabaqat.works import derive, extract_ar, key


def test_derive_kinds():
    assert derive("شرح الهداية") == ("sharh", "الهدايه")
    assert derive("حاشية على شرح الوقاية")[0] == "hashiya"
    assert derive("Şerhu’l-Hidâye") == ("sharh", "Hidâye")
    assert derive("Hâşiye alâ Şerhi’l-Mevâkıf") == ("hashiya", "Şerhi’l-Mevâkıf")
    assert derive("Muhtasaru’l-Kudûrî") == ("ikhtisar", "Kudûrî")
    assert derive("el-İnâye fî şerhi’l-Hidâye") == ("sharh", "Hidâye")
    assert derive("el-Hidâye") == (None, None)


def test_keys_match_variants():
    # i‘râb sonu ve harf-i tarif farkları aynı anahtara iner
    assert key("Kenzü’d-dekāik") == key("Kenzi’d-dekâik")
    assert key("الهداية") == key("الهدايه")
    assert key("Ferâizi’s-Sirâciyye") == key("Ferâizu’s-Sirâciyye")


def test_extract_ar_only_authorship():
    text = ("وصنّف «الهداية» و«كفاية المنتهى»، وشرح «الجامع الصغير». "
            "وقرأ عليه «القدورى». وذكره فى «الجواهر».")
    out = extract_ar({"b:1": {"text": text}}, {"b:1": "p1"})
    got = [(x["title"], x["verb"]) for x in out]
    assert ("الهداية", None) in got and ("كفاية المنتهى", None) in got
    assert ("الجامع الصغير", "sharh") in got
    assert all(t not in ("القدورى", "الجواهر") for t, _ in got)
