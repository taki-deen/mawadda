# بيانات الدول والمدن

يحتوي `locations.json.gz` على نسخة معالجة من بيانات [GeoNames](https://www.geonames.org/export/) بترخيص [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). تستخدم النسخة معرّفات الأماكن وأسماءها وأسماءها البديلة وأسماء المناطق. اختُصرت الأعمدة، ورُتبت الأماكن حسب عدد السكان، وأُضيف عرض الأسماء العربية المتوفرة من الأسماء البديلة.

المدن من `cities500.zip`، وتشمل الأماكن المأهولة ضمن نطاق هذا الملف. الدول والأقاليم من `countryInfo.txt`، وأسماء المناطق من `admin1CodesASCII.txt`. أسماء الدول في الواجهة عربية عبر `Intl.DisplayNames` عند توفر ترجمة.

لتحديث البيانات، نزّل الملفات الثلاثة من [مجلد البيانات](https://download.geonames.org/export/dump/) إلى `.geo-source` داخل `commercial`، ثم شغّل الأمر من مجلد `commercial`.

```sh
python scripts/prepare_locations.py .geo-source data/locations.json.gz
```
