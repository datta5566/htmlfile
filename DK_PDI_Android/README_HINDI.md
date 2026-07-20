# DK PDI Scanner Android APK — v1.1.0

यह Android project Knest sticker QR scan करके Supplier PDI Cum Inward Inspection Report auto-fill करता है।

## मुख्य सुविधाएँ

- Native Google Code Scanner; अलग browser camera permission की जरूरत नहीं।
- QR/Data Matrix only, ताकि छोटा linear barcode गलती से select न हो।
- Auto-zoom और successful scan vibration।
- Sticker से Barcode, IPO, Unit, Sticker Company, Width, Part Description, Length, Project, Area और Diagonal।
- Part Description में `( )` के अंदर का text हटता है।
- Report Row 1 में OK, फिर IPO, Part Description, Barcode, Length, Width और Diagonal auto-fill।
- Supplier और Knest के 5-5 samples अलग scan।
- Same side duplicate barcode warning और filled sample replace confirmation।
- Scan के बाद next sample automatic select।
- Qty manual है; sample number को Qty नहीं माना जाता।
- Overall Supplier/Knest status और full report result।
- NG मिलने पर Remark mandatory।
- Saved report history, single report delete, JSON backup/restore।
- Excel export और Android Print/PDF।
- `Open Knestfs` installed package `com.knestfs` खोलता है; install न हो तो Play Store।

## Tolerance Logic

- Length: sticker target से `-1 mm` से target तक।
- Width: sticker target से `-1 mm` से target तक।
- Diagonal: formula target से `-2 mm` से target तक।
- Hole Diameter: `16.50–16.75 mm`।
- Concrete face to hole bottom: `31.75–32.00 mm`।
- Milling Depth: `1.80–2.20 mm`।
- Milling Width: `39.00–42.00 mm`।

## Login

Default password: `12345`

## GitHub Actions से APK

1. Repository के **Actions** tab में `Build DK PDI Android APK` खोलें।
2. Build पूरा होने पर `DK-PDI-Scanner-APK` artifact download करें।
3. APK file: `DK_PDI_Scanner_v1.1.0.apk`।

Workflow प्रत्येक push और pull request पर parser tests, JavaScript syntax check, Android lint और APK build चलाता है।

## Android Studio से APK

1. `DK_PDI_Android` folder Android Studio में खोलें।
2. Gradle Sync पूरा होने दें।
3. **Build > Build APK(s)**।
4. APK path: `app/build/outputs/apk/debug/app-debug.apk`।

## Knestfs सीमा

यह integration Knestfs का home screen खोलता है। Specific drawing सीधे खोलने के लिए Knestfs का official deep link या API आवश्यक है।
