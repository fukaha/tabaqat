# Okur önerileri: kurulum

Sitedeki **Katkı / düzeltme** formu üç yoldan çalışır:

| Kim | Ne olur |
|---|---|
| Yönetici (`#/yonetim` sayfasında jetonunu girmiş olan) | Eklediği ya da kaldırdığı bağ doğrudan `site/data/katki.json` dosyasına yazılır. Site birkaç dakika içinde kendiliğinden yeniden yayımlanır. |
| Okur, bu sunucu kuruluysa | Öneri, GitHub hesabı gerekmeden bu sunucuya gider ve depoda `katki` etiketli bir konu (issue) açılır. |
| Okur, sunucu kurulu değilse | GitHub'ın hazır doldurulmuş "yeni konu" formu açılır. Okurun bir GitHub hesabı olması gerekir. |

Bekleyen öneriler yönetim panelinde listelenir. **Onayla** düğmesi öneriyi `katki.json`'a ekler ve konuyu kapatır. **Reddet** düğmesi konuyu gerekçesiyle kapatır. Yayındaki her katkı panelden geri alınabilir.

Bu önerilerin tümü herkese açık GitHub konusudur. Okur adını yazarsa ad da konuda görünür.

## 1. Yönetici jetonu (bir kez)

1. https://github.com/settings/personal-access-tokens/new adresini açın.
2. *Repository access* bölümünde *Only select repositories* seçip `fukaha/tabaqat` deposunu işaretleyin.
3. *Permissions* bölümünde **Contents: Read and write** ve **Issues: Read and write** izinlerini verin.
4. Oluşan jetonu sitedeki `#/yonetim` sayfasına yapıştırın.

Jeton yalnız o tarayıcıda saklanır. Süresi dolunca aynı adımlarla yenisini girin.

## 2. Hesapsız öneri sunucusu (isteğe bağlı, ücretsiz)

1. Bir Cloudflare hesabı açın. Ardından bu klasörde şunları çalıştırın:
   `npx wrangler login` ve `npx wrangler deploy`
2. Bu sunucu için ikinci bir jeton oluşturun. Yalnız `fukaha/tabaqat` deposu için, yalnız **Issues: Read and write** izni verin. Sonra şunu çalıştırın:
   `npx wrangler secret put GITHUB_TOKEN`
3. Deploy çıktısındaki adresi (`https://tabaqat-katki.<hesap>.workers.dev`) `site/app.js` içindeki `KATKI_URL` sabitine yazın.

Sunucu yalnız `https://fukaha.github.io` kaynağından gelen istekleri kabul eder. Alanları ve uzunlukları denetler. Bal küpü (honeypot) alanıyla basit botları eler. Yoğun istenmeyen gönderi olursa Cloudflare panelinden bir hız sınırı (rate limiting) kuralı eklenebilir.
