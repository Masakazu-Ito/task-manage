# ghp - GitHub Issue/Projects v2 管理 CLI マニュアル

## 概要

`ghp` は GitHub の Issue と Projects v2 を管理するためのコマンドラインツールです。`gh` CLI をラッパーとして使用し、REST API（Issue操作）と GraphQL API（Projects v2操作）を適切に使い分けます。

## システム概念図

### アーキテクチャ概要

```
┌─────────────────────────────────────────────────────────────────┐
│                         ユーザー                                 │
└─────────────────────────────────┬───────────────────────────────┘
                                  │ コマンド実行
                                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                        ghp CLI                                   │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                    Commander.js                            │  │
│  │              (コマンドパーサー・ルーター)                    │  │
│  └───────────────────────────────────────────────────────────┘  │
│                              │                                   │
│         ┌────────────────────┴────────────────────┐             │
│         ▼                                         ▼             │
│  ┌─────────────────┐                    ┌─────────────────┐     │
│  │  Issue Commands │                    │Project Commands │     │
│  │  - list         │                    │  - list         │     │
│  │  - create       │                    │  - view         │     │
│  │  - update       │                    │  - item-list    │     │
│  │  - close        │                    │  - item-add     │     │
│  └────────┬────────┘                    │  - item-move    │     │
│           │                             └────────┬────────┘     │
│           ▼                                      ▼              │
│  ┌─────────────────┐                    ┌─────────────────┐     │
│  │    REST API     │                    │  GraphQL API    │     │
│  │   (rest.ts)     │                    │  (graphql.ts)   │     │
│  └────────┬────────┘                    └────────┬────────┘     │
│           └────────────────────┬─────────────────┘              │
│                                ▼                                 │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                   GitHub Client                            │  │
│  │                    (client.ts)                             │  │
│  │               gh CLI ラッパー・認証管理                      │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────┬───────────────────────────────┘
                                  │ gh コマンド実行
                                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                        gh CLI                                    │
│                  (GitHub公式CLIツール)                           │
└─────────────────────────────────┬───────────────────────────────┘
                                  │ HTTPS
                                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                       GitHub API                                 │
│  ┌─────────────────────────┐    ┌─────────────────────────┐     │
│  │      REST API           │    │     GraphQL API          │     │
│  │  /repos/:owner/:repo/   │    │  Projects v2 操作        │     │
│  │  issues                 │    │  - projectsV2            │     │
│  │  - GET (list)           │    │  - addProjectV2ItemById  │     │
│  │  - POST (create)        │    │  - updateProjectV2Item   │     │
│  │  - PATCH (update)       │    │    FieldValue            │     │
│  └─────────────────────────┘    └─────────────────────────┘     │
└─────────────────────────────────────────────────────────────────┘
```

### コマンド体系

```
ghp
├── issue                        # Issue管理
│   ├── list                     # 一覧表示
│   │   ├── --repo <owner/repo>  # リポジトリ指定
│   │   ├── --state <state>      # open/closed/all
│   │   ├── --label <label>      # ラベルフィルタ
│   │   ├── --assignee <user>    # 担当者フィルタ
│   │   ├── --limit <n>          # 表示件数
│   │   └── --json               # JSON出力
│   │
│   ├── create                   # 作成
│   │   ├── --title <title>      # タイトル (必須)
│   │   ├── --body <body>        # 本文
│   │   ├── --label <label>      # ラベル (複数可)
│   │   ├── --assignee <user>    # 担当者 (複数可)
│   │   └── --milestone <n>      # マイルストーン
│   │
│   ├── update <number>          # 更新
│   │   ├── --title <title>      # タイトル変更
│   │   ├── --body <body>        # 本文変更
│   │   ├── --add-label          # ラベル追加
│   │   ├── --remove-label       # ラベル削除
│   │   └── --milestone          # マイルストーン変更
│   │
│   └── close <number>           # クローズ
│       └── --comment <comment>  # クローズコメント
│
└── project                      # Projects v2管理
    ├── list                     # プロジェクト一覧
    │   ├── --owner <user|org>   # オーナー指定
    │   └── --limit <n>          # 表示件数
    │
    ├── view <number>            # プロジェクト詳細
    │   └── --owner <user|org>   # オーナー指定
    │
    ├── item-list <number>       # アイテム一覧
    │   ├── --owner <user|org>   # オーナー指定
    │   └── --status <status>    # ステータスフィルタ
    │
    ├── item-add <number>        # アイテム追加
    │   ├── --issue <number>     # Issue番号 (必須)
    │   ├── --owner <user|org>   # オーナー指定
    │   └── --repo <owner/repo>  # Issue元リポジトリ
    │
    └── item-move <number> <id>  # ステータス変更
        ├── --status <status>    # 移動先ステータス (必須)
        ├── --issue              # IDをIssue番号として扱う
        └── --owner <user|org>   # オーナー指定
```

### データフロー

```
┌──────────────────────────────────────────────────────────────────────┐
│                          GitHub                                       │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │                      Repository                                 │  │
│  │  ┌─────────────┐                                               │  │
│  │  │   Issues    │◄─────────────────────────────────┐            │  │
│  │  │  #1, #2...  │                                  │            │  │
│  │  └──────┬──────┘                                  │            │  │
│  │         │ 参照                                     │            │  │
│  │         ▼                                         │            │  │
│  │  ┌─────────────────────────────────────────────┐  │            │  │
│  │  │              Projects v2                     │  │            │  │
│  │  │  ┌─────────────────────────────────────┐    │  │            │  │
│  │  │  │            Project #1                │    │  │            │  │
│  │  │  │  ┌───────────────────────────────┐  │    │  │            │  │
│  │  │  │  │         Fields                 │  │    │  │            │  │
│  │  │  │  │  - Status (Todo/Progress/Done) │  │    │  │            │  │
│  │  │  │  │  - Priority (High/Med/Low)     │  │    │  │            │  │
│  │  │  │  │  - Sprint, Due Date...         │  │    │  │            │  │
│  │  │  │  └───────────────────────────────┘  │    │  │            │  │
│  │  │  │  ┌───────────────────────────────┐  │    │  │            │  │
│  │  │  │  │          Items                 │  │    │  │ リンク     │  │
│  │  │  │  │  ┌─────┐ ┌─────┐ ┌─────┐     │  │    │  │            │  │
│  │  │  │  │  │ #1  │ │ #2  │ │ #3  │     │──┼────┼──┘            │  │
│  │  │  │  │  └─────┘ └─────┘ └─────┘     │  │    │               │  │
│  │  │  │  └───────────────────────────────┘  │    │               │  │
│  │  │  └─────────────────────────────────────┘    │               │  │
│  │  └─────────────────────────────────────────────┘               │  │
│  └────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘

                              ▲
                              │ API
                              │
┌─────────────────────────────┴────────────────────────────────────────┐
│                            ghp CLI                                    │
│                                                                       │
│   issue list ──────► REST API ──────► Issues一覧取得                  │
│   issue create ────► REST API ──────► Issue作成                       │
│   issue update ────► REST API ──────► Issue更新                       │
│   issue close ─────► REST API ──────► Issueクローズ                   │
│                                                                       │
│   project list ────► GraphQL ───────► プロジェクト一覧取得            │
│   project view ────► GraphQL ───────► プロジェクト詳細取得            │
│   project item-list► GraphQL ───────► アイテム一覧取得                │
│   project item-add ► GraphQL ───────► IssueをProjectに追加            │
│   project item-move► GraphQL ───────► Statusフィールド更新            │
│                                                                       │
└───────────────────────────────────────────────────────────────────────┘
```

### 典型的なワークフロー

```
  開発者                    ghp CLI                     GitHub
    │                          │                          │
    │  1. Issue作成            │                          │
    │  ghp issue create        │                          │
    │  --title "新機能"        │                          │
    │─────────────────────────►│                          │
    │                          │   POST /repos/.../issues │
    │                          │─────────────────────────►│
    │                          │                          │
    │                          │◄─────────────────────────│
    │  Issue #42 created       │      Issue #42           │
    │◄─────────────────────────│                          │
    │                          │                          │
    │  2. Projectに追加        │                          │
    │  ghp project item-add    │                          │
    │  1 --issue 42            │                          │
    │─────────────────────────►│                          │
    │                          │  GraphQL: mutation       │
    │                          │  addProjectV2ItemById    │
    │                          │─────────────────────────►│
    │                          │◄─────────────────────────│
    │  Added to Project #1     │      Item ID             │
    │◄─────────────────────────│                          │
    │                          │                          │
    │  3. 作業開始             │                          │
    │  ghp project item-move   │                          │
    │  1 42 -i -s "In Progress"│                          │
    │─────────────────────────►│                          │
    │                          │  GraphQL: mutation       │
    │                          │  updateProjectV2Item...  │
    │                          │─────────────────────────►│
    │                          │◄─────────────────────────│
    │  Status updated          │                          │
    │◄─────────────────────────│                          │
    │                          │                          │
    │  4. 完了・クローズ       │                          │
    │  ghp issue close 42      │                          │
    │  --comment "完了"        │                          │
    │─────────────────────────►│                          │
    │                          │  PATCH /repos/.../issues │
    │                          │─────────────────────────►│
    │                          │◄─────────────────────────│
    │  Issue #42 closed        │                          │
    │◄─────────────────────────│                          │
    │                          │                          │
```

## 前提条件

- Node.js 18.0.0 以上
- GitHub CLI (`gh`) がインストール済みで認証済みであること
- `gh auth login` で GitHub にログイン済みであること

## インストール

```bash
# リポジトリをクローン
git clone <repository-url>
cd task-manage

# 依存関係をインストール
npm install

# ビルド
npm run build

# グローバルにリンク（オプション）
npm link
```

## コマンド一覧

### Issue 管理

#### `ghp issue list` - Issue一覧表示

```bash
# 現在のリポジトリのopen Issueを一覧表示
ghp issue list

# 特定のリポジトリを指定
ghp issue list --repo owner/repo

# closed Issueを表示
ghp issue list --state closed

# すべてのIssueを表示
ghp issue list --state all

# ラベルでフィルタ
ghp issue list --label bug --label urgent

# 担当者でフィルタ
ghp issue list --assignee username

# 表示件数を指定
ghp issue list --limit 50

# JSON形式で出力
ghp issue list --json
```

#### `ghp issue create` - Issue作成

```bash
# 基本的な作成
ghp issue create --title "バグ: ログインできない"

# 本文を追加
ghp issue create --title "新機能の提案" --body "詳細な説明..."

# ラベルを付与
ghp issue create --title "バグ修正" --label bug --label priority-high

# 担当者を指定
ghp issue create --title "タスク" --assignee username1 --assignee username2

# マイルストーンを指定
ghp issue create --title "v2.0向け機能" --milestone 3

# 別リポジトリに作成
ghp issue create --title "Issue" --repo owner/repo
```

#### `ghp issue update` - Issue更新

```bash
# タイトルを変更
ghp issue update 42 --title "新しいタイトル"

# 本文を変更
ghp issue update 42 --body "更新された本文"

# ラベルを追加
ghp issue update 42 --add-label enhancement

# ラベルを削除
ghp issue update 42 --remove-label bug

# マイルストーンを変更
ghp issue update 42 --milestone 5

# マイルストーンを削除
ghp issue update 42 --milestone none

# 担当者を追加
ghp issue update 42 --add-assignee username
```

#### `ghp issue close` - Issueクローズ

```bash
# Issueをクローズ
ghp issue close 42

# コメントを付けてクローズ
ghp issue close 42 --comment "修正完了しました"

# 別リポジトリのIssueをクローズ
ghp issue close 42 --repo owner/repo
```

### Projects v2 管理

#### `ghp project list` - プロジェクト一覧

```bash
# 現在のリポジトリオーナーのプロジェクト一覧
ghp project list

# 特定のユーザー/組織のプロジェクト一覧
ghp project list --owner username
ghp project list --owner organization-name

# 表示件数を指定
ghp project list --limit 10

# JSON形式で出力
ghp project list --json
```

#### `ghp project view` - プロジェクト詳細表示

```bash
# プロジェクトの詳細を表示（番号で指定）
ghp project view 1

# 特定オーナーのプロジェクト
ghp project view 1 --owner username

# JSON形式で出力
ghp project view 1 --json
```

表示される情報:
- プロジェクト名、ステータス、URL
- フィールド一覧（Status, Priority など）
- アイテム一覧

#### `ghp project item-list` - プロジェクトアイテム一覧

```bash
# プロジェクト内のアイテム一覧
ghp project item-list 1

# ステータスでフィルタ
ghp project item-list 1 --status "In Progress"
ghp project item-list 1 --status "Done"

# JSON形式で出力
ghp project item-list 1 --json
```

#### `ghp project item-add` - プロジェクトにIssueを追加

```bash
# 現在のリポジトリのIssueを追加
ghp project item-add 1 --issue 42

# 別リポジトリのIssueを追加
ghp project item-add 1 --issue 42 --repo owner/repo

# 特定オーナーのプロジェクトに追加
ghp project item-add 1 --issue 42 --owner username
```

#### `ghp project item-move` - アイテムのステータス変更

```bash
# アイテムIDでステータスを変更
ghp project item-move 1 PVTI_abc123 --status "Done"

# Issue番号でステータスを変更（--issue フラグを使用）
ghp project item-move 1 42 --issue --status "In Progress"

# 特定オーナーのプロジェクト
ghp project item-move 1 42 --issue --status "Done" --owner username
```

## 出力形式

すべてのコマンドは `--json` オプションでJSON形式の出力をサポートします。

```bash
# テーブル形式（デフォルト）
ghp issue list

# JSON形式
ghp issue list --json
```

## ワークフロー例

### 1. Issue作成からプロジェクト管理まで

```bash
# 1. Issueを作成
ghp issue create --title "新機能: ダークモード対応" --label enhancement

# 2. プロジェクトに追加
ghp project item-add 1 --issue 123

# 3. ステータスを変更
ghp project item-move 1 123 --issue --status "In Progress"

# 4. 完了時
ghp project item-move 1 123 --issue --status "Done"
ghp issue close 123 --comment "実装完了"
```

### 2. 日次タスク確認

```bash
# 自分にアサインされたIssueを確認
ghp issue list --assignee @me

# プロジェクトの進行中タスクを確認
ghp project item-list 1 --status "In Progress"
```

## トラブルシューティング

### 「Could not determine repository」エラー

Gitリポジトリ外で実行した場合に発生します。`--repo` オプションでリポジトリを指定してください。

```bash
ghp issue list --repo owner/repo
```

### 「Could not determine owner」エラー

プロジェクト操作時にオーナーを特定できない場合に発生します。`--owner` オプションで指定してください。

```bash
ghp project list --owner username
```

### 「Status field not found」エラー

プロジェクトにStatusフィールドがない場合に発生します。GitHubのプロジェクト設定でStatusフィールドを追加してください。

### 認証エラー

```bash
# gh CLIで再認証
gh auth login
```

## 開発

```bash
# ビルド
npm run build

# 開発モード（ウォッチ）
npm run dev

# テスト
npm test

# 型チェック
npm run lint
```

## 更新履歴

- **v1.0.0** - 初回リリース
  - Issue管理: list, create, update, close
  - Project管理: list, view, item-list, item-add, item-move
  - テーブル/JSON出力サポート
