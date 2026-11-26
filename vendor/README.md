# Bibliothèques embarquées (aucun CDN : tout est servi par le site lui-même, donc utilisable hors-ligne)

| Fichier | Origine | Licence | Rôle |
|---|---|---|---|
| `zxing.min.js` | `@zxing/library` 0.21.3 | Apache-2.0 | lecture des codes-barres par la caméra (iPhone : pas de `BarcodeDetector`) |
| `tesseract.min.js`, `worker.min.js` | `tesseract.js` 5.1.1 | Apache-2.0 | lecture (OCR) d'un ticket photographié |
| `tesseract-core-lstm.wasm.js` | `tesseract.js-core` 5.1.1 | Apache-2.0 | moteur OCR (WebAssembly, ≈ 4 Mo) |
| `pdf.min.js`, `pdf.worker.min.js` | `pdfjs-dist` 3.11.174 (build `legacy`) | Apache-2.0 | lecture directe du texte d'un ticket au format PDF (e-ticket) : aucune erreur d'OCR |
| `lang/fra.traineddata.gz` | `@tesseract.js-data/fra` 1.0.0 (`4.0.0_best_int`) | Apache-2.0 | modèle de langue française (≈ 0,7 Mo) |

Ces fichiers ne sont chargés **qu'à la première utilisation** du scanner / de la lecture de ticket, puis gardés en cache par le service worker (cache `gamelle-vendor-v1`, conservé d'une version à l'autre).
