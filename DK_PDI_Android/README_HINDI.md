# DK PDI Scanner Android APK

यह Android project PDI Sticker Scanner को installable APK में बनाता है।

## मुख्य सुविधाएँ

- Native Google Code Scanner: `Scan Sticker` दबाने पर Android camera scanner खुलता है।
- Scanner QR/Data Matrix को प्राथमिकता देता है, ताकि linear barcode का केवल number scan होकर अधूरा data न आए।
- Sticker से Barcode, IPO, Unit, Supplier, Width, Part Description, Length, Project, Area और Diagonal automatic निकलते हैं।
- Report Row 1 में OK, फिर IPO, Part Description, Barcode, Length, Width और Diagonal auto-fill होते हैं।
- Hole Diameter: 16.50–16.75 mm.
- Concrete face to hole bottom: 31.75–32.00 mm.
- Milling Depth: 1.80–2.20 mm.
- Milling Width: 39.00–42.00 mm.
- Actual value के अनुसार automatic OK/NG.
- `Open Knestfs` installed package `com.knestfs` को सीधे खोलता है; installed नहीं हो तो Play Store खुलता है।
- Excel export `Downloads/DK_PDI` folder में save होता है।
- Android Print/PDF dialog included.

## Login

Default password: `12345`

## GitHub Actions से APK

Repository के Actions tab में **Build DK PDI Android APK** workflow खोलें। Build पूरा होने पर `DK-PDI-Scanner-APK` artifact से APK download करें।

## Android Studio से APK

1. `DK_PDI_Android` folder Android Studio में खोलें.
2. Gradle Sync पूरा होने दें.
3. Build > Build APK(s).
4. APK path: `app/build/outputs/apk/debug/app-debug.apk`.

## Knestfs सीमा

यह integration Knestfs का home screen खोलता है। Specific drawing सीधे खोलने के लिए Knestfs का official deep link या API आवश्यक है।
