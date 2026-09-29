# Tabaqat — Hanefi teracim külliyatı

Hanefi biyografi kitaplarını (el-Cevâhiru'l-mudiyye, Ketâibü a'lâmi'l-ahyâr, et-Tabakâtü's-seniyye, el-Fevâidü'l-behiyye …) işleyip ortak şahıs başlıkları, hoca–talebe ağı ve ilmî yolculuk haritası olarak statik bir sitede yayınlar.

- `pipeline/` — Python: ayrıştırma, normalizasyon, çıkarım, eşleştirme, dışa aktarım
- `books/` — kitap başına ayrıştırma ayarları (YAML)
- `review/` — insan onaylı eşleştirme kararları
- `site/` — Arapça (RTL) statik arayüz; veri `site/data/*.json`

```
pip install -e "pipeline[dev]" && pytest pipeline
```

## Şahıs birleştirme

```
python -m tabaqat.cli match      # (pipeline/ içinde) → data/persons.json, review/pending.yml
```

1. **Ad ve vefat:** Her maddenin adı başlıktan alınır (Guref ve Kand'da fihristten). Ad parçalarına
   ayrılır: nesep zinciri, künye, nisbe, lakap. Vefat yılı metindeki "توفي/مات ... سنة ..." ifadesinden
   okunur.
2. **Muhakkik atıfları** ("الجواهر المضية، برقم ٤٩٤", "(٤/ ٤١٦)") hedef maddeyi gösterir. Yalnız
   doğrulamada bizim baskılarımızla tutarlı çıkan atıf türleri kullanılır; her atıf ayrıca adla
   sınanır.
3. **İsim karşılaştırması:** zincirin baştan kaç halkası tutuyor, künye/nisbe/lakap örtüşmesi, vefat
   yılı. Nadir nisbe daha güçlü kanıt sayılır; müellifinden çok sonra ölen biri o kitapta yer alamaz.
4. **Kümeleme:** Aynı kitabın iki asıl maddesi bir şahısta birleşmez. Künye/nisbe bölümlerindeki
   tekrarlar bu kuralın dışındadır. Ayrıca ism'i ya da güvenilir vefatı uyuşmayan kümeler
   birleşmez. Böyle durumlar onaya düşer.
5. **Esas ad:** el-Gurefü'l-aliyye fihristinin yazımıyla verilir:
   `النسب، النسبة، ... [ت. ٧٧٤هـ/١٣٧٢م]`. Şahıs Guref'te varsa fihristteki ad kullanılır. Yoksa
   Kand fihristi, o da yoksa en az üç halkalı nesep veren başlık alınır. Vefat yalnız fihristte
   ya da en az iki kaynakta uyuşuyorsa gösterilir.

İnsan onayı:
- `review/pending.yml`: şüpheli çiftleri listeler. `karar:` alanına `aynı` ya da `farklı` yazıp
  komutu yeniden çalıştırın.
- `review/decisions.yml`: verilen kararlar burada kalıcı olarak saklanır.
- `review/overrides.yml`: başlığı ad olmayan maddeler için elle ad ve vefat düzeltmesi.

### Onay sayfası

`site/review/` sayfası şüpheli çiftleri yan yana gösterir ve kararları sayfanın kendi veritabanında
saklar. Sayfa, Claude artifact'ı olarak yayınlanır. Veri dosyası `site/review/data.json`, her
`match` koşusunda yeniden üretilir.

Sayfadaki kararlar `{"a|b": "same" | "different"}` biçiminde bir JSON dosyasına alınıp şu komutla
`review/decisions.yml`'e işlenir; ardından `match` yeniden çalıştırılır:

```
python -m tabaqat.cli apply-review karar.json
```

## Hoca–talebe ağı

```
python -m tabaqat.cli network        # → data/relations.json, data/relations_unresolved.json,
                                     #   site/network-review/data.json
python -m tabaqat.cli apply-network kararlar.json   # onay sayfası kararları → review/relations.yml
```

- **Çıkarım** (`network/extract.py`): madde metninde "تفقه على / تفقه عليه", "أخذ عن / أخذ عنه",
  "روى عن / روى عنه", "سمع من / سمع منه", "قرأ على / قرأ عليه", "تخرج", "صحب / لازم",
  "من أصحاب", "أستاذ" kalıpları. Ad listeleri ("على A، وB")
  ayrılır. Ad olmayan ilk parçada liste biter. Akrabalık atıfları ("على أبيه", "ابنه أحمد") ve
  Fevâid/Ketâib'in "أخذ عن A عن B عن C" zincirleri ayrıca işlenir.
- **Çözüm** (`network/resolve.py`): Adaylar ism, künye, nisbe, lakap ve şöhret başlığıyla
  ("أبو علي النسفي", "فخر الدين قاضي خان") toplanır. Sonra nesep uyumuyla puanlanır ve vefat
  yıllarıyla süzülür. Yalnız ism ya da yalnız künye hiçbir zaman yetmez. Yalnız nisbe ancak tek ve
  çok kaynaklı bir adayda kabul edilir. Vefatı bilinmeyenlere ağdan tahmini vefat verilir
  (ikinci tur).
- **Belirsiz atıflar** üç turda çözülür. Adayın önceki turda aynı yönde bağı varsa ya da
  adayın kendi maddesinde madde sahibi anılıyorsa bu "çapraz kayıt" sayılır. Ardından tek
  "yakın vefat"lı aday aranır (hoca, talebeden en çok 80 yıl önce ölmüş olmalı). En son şöhrete
  bakılır. Çözülemeyenler gerekçeleriyle `review/supheli_atiflar.md` dosyasına yazılır.
- **Dış kişiler**: `review/external.yml` dosyasındaki kişilerin bu kitaplarda maddesi yok
  (Buhârî, İbn Maîn, Zehebî…). Vefatları uyarsa `data/relations_external.json` dosyasına
  kaydedilirler.
- **Elle eşleme**: `review/aliases.yml` (أبو حنيفة، أبو يوسف، زفر…). `@zincir` bayrağı eşlemeyi
  yalnız zincirlerde geçerli kılar. `@yakın` bayrağı zincir dışında da uygular; bunun için vefat
  yakın olmalı ya da cümlede Ebû Yûsuf, Züfer veya Hasan b. Ziyâd da anılmalı. Tek başına "محمد"
  bu yolla İmam Muhammed'e bağlanır. Elle eşlemeler de kronolojiye uymak zorundadır.
- **İnsan kararları**: `review/relations.yml` üç liste tutar. `choose`, belirsiz atıf için seçilen
  şahıstır. `reject`, yanlış bağdır. `ok`, doğrulanmış bağdır.
- Her kenar kanıtlarını taşır: madde, ilişki türü, atıf metni, cümle.

## Coğrafya

```
python -m tabaqat.cli geo            # → data/places.json, data/person_places.json
```

- **Gazetteer**: `data/gazetteer/thurayya.tsv` dosyası el-Süreyyâ'dan (al-Thurayya, CC BY 4.0)
  gelir. `review/places_extra.yml` şunları ekler:
  - yazım eşlemeleri (بخارى، مصر → القاهرة);
  - Osmanlı ve Hind şehirleri ile bölgeler;
  - düzensiz nisbeler (الرازي → الري);
  - yer sanılan yaygın kelimeler (عنه، جده، ثمانين…).
- **Çıkarım** (`geo/extract.py`): tetikleyici kelimeden sonra, aynı cümlede gelen ilk yer adı
  alınır. Tetikleyiciler şu türlere ayrılır:
  - doğum: ولد;
  - vefat: مات/توفي;
  - defin: دفن;
  - yolculuk: رحل/قدم/دخل;
  - ikamet: سكن/نزل/جاور;
  - görev: ولي قضاء/درّس;
  - faaliyet: حدّث/سمع;
  - köken: من أهل.

  "بها / فيها" en son anılan yere döner. Nisbeler de yere bağlanır (البخاري → بخارى).

## Site

```
python -m tabaqat.cli site           # → site/data/ (index, p/NN parçaları, graph, places)
python -m tabaqat.geo.basemap <natural-earth-dizini>   # → site/data/basemap.json (bir kez)
```

`site/` dizinindeki statik site Arapça ve RTL'dir; dış kütüphane kullanmaz. Bölümleri:

- **Arama.**
- **Şahıs sayfası:** atıflar, hocalar ve talebeler (kanıt cümleleriyle), dış hocalar, yerler ve
  mini harita.
- **Ağ:** bir şahsın bir ya da iki kuşak hoca ve talebesi; ayrıca bütün ağ, vefat yılına göre
  zaman eksenli.
- **Harita:** asır ve atıf türü süzgeçleri, yere tıklayınca oradaki âlimlerin listesi.

Madde metinlerinin tamamı yayımlanmaz; yalnız atıflar ve kısa kanıt cümleleri yer alır.
`.github/workflows/pages.yml`, `main` dalına her gönderimde siteyi GitHub Pages'e yayımlar. Bunun
için depo ayarlarında Pages kaynağı "GitHub Actions" seçilmelidir.
