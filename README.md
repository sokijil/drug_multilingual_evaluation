# 逆翻訳評価フォーム

薬剤情報の多言語翻訳（日本語→各言語）を、逆翻訳（各言語→日本語に訳し戻したもの）を見比べて薬剤師が評価するためのWebフォームです。対象言語が読めなくても評価できます。

## 使い方（評価者向け）

1. 下記URLをブラウザで開く（スマホ・PCどちらでも可、ログイン不要）
   - https://sokijil.github.io/drug_multilingual_evaluation/
2. 自分の担当（評価者A / B / C）を選ぶ（他の評価者と重複しないよう事前に決めておく）
3. 360項目を1つずつ回答する（回答はブラウザに自動保存される）
4. すべて終わったら「保存・書き出し」→「回答をダウンロード（CSV）」で `評価回答_A.csv`（または `_B.csv` / `_C.csv`）を保存し、依頼者に送る

## データの取り込み（依頼者向け）

1. 届いた `評価回答_A.csv` / `_B.csv` / `_C.csv` を `research/data/human_eval/` に置く
2. `python research/scripts/09_import_web_eval.py` を実行 → 既存の `評価シート_A.xlsx` / `_B.xlsx` / `_C.xlsx` に反映される
3. `python research/scripts/06_analyze_human_eval.py` で集計

## このリポジトリの内容について

- 含まれるのは薬品名・機械翻訳文・誤訳カテゴリのみで、患者情報は含みません。
- `research/scripts/08_export_eval_items.py` が `items.json`（360項目）を生成しています。項目セット・IDはExcel版の評価シート（`05_build_eval_sheet.py`）と完全に同一です。
- 2026-09-04に10薬品180項目→20薬品360項目へ拡張しました。先頭の E001〜E180 は拡張前と完全に同一（薬品・順序・ID）なので、拡張前に記入済みの回答はそのまま有効です。追加分は E181〜E360。
