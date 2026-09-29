# Tabaqat — Hanefi teracim külliyatı

Hanefi biyografi kitaplarını (el-Cevâhiru'l-mudiyye, Ketâibü a'lâmi'l-ahyâr, et-Tabakâtü's-seniyye, el-Fevâidü'l-behiyye …) işleyip ortak şahıs başlıkları, hoca–talebe ağı ve ilmî yolculuk haritası olarak statik bir sitede yayınlar.

- `pipeline/` — Python: ayrıştırma, normalizasyon, çıkarım, eşleştirme, dışa aktarım
- `books/` — kitap başına ayrıştırma ayarları (YAML)
- `review/` — insan onaylı eşleştirme kararları
- `site/` — Arapça (RTL) statik arayüz; veri `site/data/*.json`

```
pip install -e "pipeline[dev]" && pytest pipeline
```
