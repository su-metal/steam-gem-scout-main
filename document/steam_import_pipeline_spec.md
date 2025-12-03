# Steam Import Pipeline 仕様まとめ

本ドキュメントは、現在議論している **Steam → DB → ランキング → AI解析** の一連のパイプライン仕様を整理したものです。
アプリの正しいデータフローと役割分担を明確にします。

---

# 1. 全体アーキテクチャ（3レイヤー構造）

本プロジェクトは、以下 3 つのレイヤーに分けて考える：

## レイヤー1：Steam データ倉庫（`steam_games`）
- 大量のゲーム情報を **Steam API / SteamSpy / CSV** などからまとめて取得して保存する領域。
- 目的：
  - 候補ゲームの母集団を溜めておく
  - ランキング生成やフィルタのための "倉庫"

**`steam_games` の主なカラム**：
- `app_id`
- `title`
- `positive_ratio`
- `total_reviews`
- `estimated_owners`
- `price`
- `average_playtime`
- `tags`
- `steam_url`
- `review_score_desc`
- `last_steam_fetch_at`

> ※ 倉庫なので、AI解析結果はここには入れない。

---

## レイヤー2：ランキングデータ（`game_rankings_cache`）
- 倉庫から **条件にマッチしたゲームだけ**を並べる "ショーウィンドウ"。
- ユーザーが一覧で見るのは基本的にここ。
- Import filtered games で決まったゲームだけをここへコピー。

**RankingGame の構造**：
- 倉庫（steam_games）の情報を元に組み立てる
- 一部のフィールドは初期値（analysisは空 or null）

※ GameDetail を開いた時点で AI を叩くため、ランキング側は軽量でOK。

---

## レイヤー3：AI解析レイヤー（`analyze-hidden-gem`）
- GameDetail を開いたとき、またはバッチ解析時にのみ OpenAI API を叩く。
- ランキング生成時には **AIを一切使わない**（クレジット節約）
- 解析結果は `game_rankings_cache` の中の `analysis` フィールドに保存

---

# 2. 手動インポート（デバッグ用）

- 本番用ではない。
- `search-hidden-gems` エッジ関数を直接叩き、
  - Steam API → AI（optional）→ `game_rankings_cache` → `steam_games`
  という単体テスト目的のショートカットルート。

> 本来の運用では使用しない。動作確認用に残しておく機能。

---

# 3. `import-steam-games` の本来の役割

`import-steam-games` は **ランキング生成専用の関数** として扱う。

## ● Preview candidates
- `steam_games` から条件でフィルタ
- Steam API は叩かない
- 候補ゲームの一覧を返すだけ

## ● Import filtered games
- Preview と同じ条件で `steam_games` をフィルタ
- その結果を元に、
  **`steam_games` → `game_rankings_cache` にコピーするだけ**
- Steam API は叩かない（本来の仕様）
- analysis は空（詳細は GameDetail で AI に任せる）

### Import filtered games の目的
- "倉庫（steam_games）" に大量に溜まったゲームの中から、
  条件に合うゲームだけをランキング一覧に並べる動作
- Steam API を再呼び出ししない → APIコストゼロ

---

# 4. 想定するパイプライン全体フロー

## ◆ Step 1：大量タイトルを倉庫に集める
手段は複数：
- （A）バッチEdge Functionで Steam API を叩いて自動収集
- （B）SteamSpy の CSV を読み込んで一括登録
- （C）運営者用の裏メニューから特定ジャンル/タグをまとめ取り込み

結果：`steam_games` に数千～数万本が溜まる

---

## ◆ Step 2：条件に合うゲームだけランキングに載せる
- ImportSteamGamesPage のフィルタ機能
- 条件：
  - ポジティブ率
  - レビュー数
  - 所有者数
  - 価格
  - タグ
  - 期間（last_steam_fetch_at）

- Preview → 候補一覧
- Import filtered games → `game_rankings_cache` へコピー

> この段階では AI は一切関わらない。

---

## ◆ Step 3：ユーザーが個別ゲームを開いたときだけ AI を使う
- GameDetail を開いたとき、analysis が null なら `analyze-hidden-gem` を実行
- 結果をDBに保存し、以後はキャッシュ利用

→ クレジット節約＋高速化

---

# 5. 今後の変更予定（実装方針）

## ✔ Import filtered games から Steam API 呼び直しを削除する
- 現状は `fetchAndBuildRankingGame` を呼んで再度 Steam API を叩いている
- 本来の意味は
  **steam_games の値をそのまま使って ranking 用 JSON を作るだけ**
- これに書き換えることで挙動が理想形になる

## ✔ steam_games を自動で埋める別の Edge Function を作る
- `sync-steam-games` のような名前で
- タグ・ジャンル・appIdリストなどでまとめて Steam API を叩き、倉庫を更新

---

# 6. 用語定義

**steam_games**：大量のゲームの倉庫。ランキング生成の母集団。

**game_rankings_cache**：ユーザーに見せるランキング用テーブル。

**Preview candidates**：`steam_games` に対し SQL 的な絞り込みを行う動作。

**Import filtered games**：絞り込んだ結果をランキングテーブルに登録する動作。

**search-hidden-gems**：単体ゲームインポート用のデバッグ機能（本番では使わない）。

---

# 7. 最終的に達成される仕様

- Steam API を大量に叩くのは **倉庫を更新するときだけ**
- ランキング生成時には Steam API を叩かない
- AI 解析は必要なゲームだけ
- `steam_games` の母集団 → `game_rankings_cache` のショーウィンドウ → GameDetail の AI 解析

このパイプラインにより、API コスト最小、運用が自動的、拡張性も高い構成になる。

