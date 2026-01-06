# tnet_cascade_rtdetr Detection 改善案

## 1. 現状把握 (Current Status Analysis)

提供された評価レポートに基づき、現状のモデル (`tnet_cascade_rtdetr`) のパフォーマンスと課題を分析しました。
目標である「Val, Testともに全てのスコア80%以上」に対し、特に **Testデータでの大幅な精度低下** が最大の課題です。

### 📊 パフォーマンス概要

| Metric | Val Score | Test Score | 乖離 (Drop) | 評価 |
| :--- | :---: | :---: | :---: | :--- |
| **Detection Overall** | **82.70%** | **46.43%** | ⬇️ **36.27%** | ❌ 深刻な過学習またはドメインシフト |
| Player (Front) F1 | 96.26% | 86.39% | ⬇️ 9.87% | ✅ 許容範囲 (目標80%達成) |
| **Player (Back) F1** | **90.51%** | **32.16%** | ⬇️ **58.35%** | ❌ Testで崩壊している |
| **Ball PCK@10px** | 67.15% | 33.40% | ⬇️ 33.75% | ❌ Valでも目標未達、Testは致命的 |
| **Court PCK@10px** | 87.58% | 46.61% | ⬇️ 40.97% | ❌ Testでの汎化性能が低い |

### 🔍 主な課題点

1.  **汎化性能の欠如 (Generalization Issue):**
    *   ValとTestの乖離が極めて大きい。Testセットの撮影環境（カメラアングル、照明、コートの種類）がTrain/Valと大きく異なる可能性があります。
    *   特に `Player (Back)` と `Court` の極端な低下は、特定の視点にモデルが過学習していることを示唆しています。

2.  **背後プレイヤー (Player Back) の検出失敗:**
    *   TestでのRecallが32.14%と極めて低く、ほとんど検出できていません。Front（86%）との差が激しく、データの偏りや特徴抽出の失敗が疑われます。

3.  **ボール検出 (Ball Detection) の精度不足:**
    *   Valでも67%と目標の80%を下回っています。ボールは小物体であるため、現在の解像度や特徴マップのストライドでは情報が消失している可能性があります。

---

## 2. 改善提案 (Improvement Plan)

改善案を優先度（P0〜P2）順に提案します。

### 🚨 Priority 0: データセットと評価の精査 (Critical)

まず「なぜTestだけでこれほど悪いのか」を特定する必要があります。

-   **[Action] Testセットのエラー分析:**
    -   `visualization_test-vertex-*.webm` を確認し、検出失敗（FN）の傾向を特定する。
    -   「Player Back」が映っているシーンが、学習データに含まれないアングルや距離感ではないか確認する。
-   **[Action] Splitの見直し:**
    -   Train/Val/Testの分割が時系列や試合単位で適切に行われているか確認する。特定の試合/コートがTestにのみ含まれ、その特性に適応できていない可能性が高い。

### 🔥 Priority 1: 汎化性能の向上 (High Impact)

Testスコアを引き上げるための施策です。

-   **[Data] 強力なData Augmentationの導入:**
    -   **Geometric Augmentation:** `RandomPerspective`, `RandomAffine` (Rotation, Shear, Scale) を強化し、カメラアングルの違いに対する頑健性を高める（Court, Player Back対策）。
    -   **Photometric Augmentation:** `ColorJitter`, `RandomBrightnessContrast` で照明変化に対応する。
    -   **Mosaic / Mixup:** 背景の多様性を高めるためにRT-DETR標準のMosaicを有効化・調整する（ただし、ボールのコンテキストが壊れないよう注意が必要）。
-   **[Data] Player Backデータの拡充・再サンプリング:**
    -   学習データ内で「Player Back」クラスのサンプル数が少ない、あるいはバリエーションが乏しい場合、Oversamplingを行うか、当該シーンを重点的に収集する。

### 🚀 Priority 2: 小物体（ボール）検出の改善 (Ball Detection)

Val/Test共に低いボール検出精度を改善します。

-   **[Model] 高解像度特徴マップの利用:**
    -   RT-DETRのEncoder/Decoderに入力する特徴マップとして、より浅い層（例: Stride 4 or 8）の高解像度特徴を利用するようにFPN/Backbone接続を変更する。
-   **[Config] 入力解像度の引き上げ:**
    -   推論・学習時の画像サイズ（例: 640x640 → 1280x1280など）を大きくし、ボールのピクセル数を確保する。
-   **[Loss] Loss Weightの調整:**
    -   BallクラスのLossに対する重みを上げる、またはDetection Loss全体の中でBox Lossの比重を調整する。

### 🔧 Priority 3: 構造的アプローチ (Architecture)

-   **[Model] Test Time Augmentation (TTA):**
    -   推論時にMulti-scaleやFlipを行い、予測を平均化することでスコアを底上げする。
-   **[Model] Temporal Contextの活用 (Video Detection):**
    -   現状が単フレーム検出であれば、前後のフレーム情報を利用する（Trackingや3D CNN、Sequence Model）ことで、オクルージョンやモーションブラーの激しいボール・スイングの検出精度を安定させる。

---

## 📝 TODOリスト

まずは以下の設定変更と検証から着手することを推奨します。

1.  `config` ファイルのAugmentation設定を確認し、Perspective/Affineの強度を上げる。
2.  `dataset` クラスで Player Back の出現頻度を確認する。
3.  ボール検出向上のため、入力サイズ (`img_size`) を変更して実験する。
