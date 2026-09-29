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
