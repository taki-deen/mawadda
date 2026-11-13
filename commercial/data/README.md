# بيانات الدول والمدن

يحتوي `locations.json.gz` على نسخة معالجة من بيانات [GeoNames](https://www.geonames.org/export/) بترخيص [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). تستخدم النسخة معرّفات الأماكن وأسماءها وأسماءها البديلة وأسماء المناطق. اختُصرت الأعمدة، ورُتبت الأماكن حسب عدد السكان، وأُضيف عرض الأسماء العربية المتوفرة من الأسماء البديلة.

المدن من `cities500.zip`، وتشمل الأماكن المأهولة ضمن نطاق هذا الملف. الدول والأقاليم من `countryInfo.txt`، وأسماء المناطق من `admin1CodesASCII.txt`. أسماء الدول في الواجهة عربية عبر `Intl.DisplayNames` عند توفر ترجمة.

لتحديث البيانات، نزّل الملفات الثلاثة من [مجلد البيانات](https://download.geonames.org/export/dump/) إلى `.geo-source` داخل `commercial`، ثم شغّل الأمر من مجلد `commercial`.

```sh
python scripts/prepare_locations.py .geo-source data/locations.json.gz
```

تستخدم خريطة اختيار الدولة ملف `country-map.json` المولّد من بيانات [Natural Earth](https://www.naturalearthdata.com/) العامة. تُختصر الإحداثيات لتسريع العرض على الموبايل. قائمة الدول في البروفايل تشمل الأماكن التي قد لا تظهر على الخريطة.

```sh
curl -L -o .geo-source/ne_50m_admin_0_countries.geojson https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_50m_admin_0_countries.geojson
python scripts/prepare_country_map.py .geo-source/ne_50m_admin_0_countries.geojson data/country-map.json
```
