# race-master（レース・マスター）

スマートフォン横画面向け、最大12人の3Dマルチプレイヤー・アクションレースゲーム。
クライアントは Unity（C#）、オンライン機能（ルーム・ランキング）は Firebase を使用します。

> 現在は初期実装（設計書＋コアスクリプト）の段階です。Unity プロジェクト本体・ステージ・アセットは含まれていません。
> スクリプトは Unity エディタ上でのコンパイル・実機確認をまだ行っていません。

## 構成

| パス | 内容 |
|---|---|
| `docs/UI_LAYOUT.md` | 横画面UIレイアウト構成案（レースHUD / メニュー / ロビー＋アイテム図鑑 / ランキング） |
| `unity/GameModeManager.cs` | タイムアタック ⇔ グランプリ/VS の切り替え、フェーズ管理、AI枠埋め、横画面固定 |
| `unity/FirebaseRoomService.cs` | ルームID方式のロビー（作成・参加・開始合図）。Realtime Database 使用 |
| `unity/RankingService.cs` | ステージ別・最速ラップのグローバルランキング（送信・リアルタイム購読・ローカル保存） |
| `unity/PlayerProfileService.cs` | 初回登録 → 引き継ぎコード発行 → 2回目以降スキップ、名前・アイコン変更のランキング一括同期、コードでの復元 |
| `unity/TouchDriveInput.cs` | どこでもステアリング（触れた点がセンター）＋右下ドリフトボタン。Input System 対応、ボタン配置の保存 |
| `unity/KartPaintEditor.cs` | 車体ペイントエディタ（ブラシ・消しゴム・画像ステッカーの位置/サイズ/回転、マシンの拡大縮小・回転、保存） |
| `unity/Shaders/PaintBlit.shader` | ペイントエディタ用の合成シェーダー |
| `unity/LapTracker.cs` | 5ステージの定義、ラップ計測、ショートカット判定 |
| `unity/CheckpointTrigger.cs` | チェックポイント／ショートカットゲート用トリガー |
| `unity/KartStats.cs` | フレーム / ホイール / ウィング / エンジンの4パーツとステータス計算 |
| `unity/KartDriftController.cs` | 走行、ドリフト、3段階ミニターボ（青 → 黄 → 紫）、アイテム効果フック |
| `firebase/database.rules.json` | Realtime Database セキュリティルール |

## セットアップ

1. Unity（2022.3 LTS 以降、URP）で 3D プロジェクトを作成し、`unity/` 内を `Assets/Scripts/RaceMaster/` へコピー。
   - **Input System** パッケージを導入（Active Input Handling を Input System か Both に）。
   - `KartStats.cs` には ScriptableObject が4種入っています。Unity のバージョンによっては1クラス1ファイルに分ける必要があります。
   - `KartPaintEditor` の `paintShader` に `RaceMaster/PaintBlit` を割り当て、車体メッシュは Read/Write 有効＋MeshCollider 付きにします。
2. Firebase プロジェクトを作成し、**Authentication（匿名）** と **Realtime Database** を有効化。
3. Firebase Unity SDK から `FirebaseAuth` と `FirebaseDatabase` をインポートし、`google-services.json` / `GoogleService-Info.plist` を配置。
4. ルールをデプロイ：`firebase deploy --only database`
5. 起動シーンで `PlayerProfileService.BootAsync()` を呼び、戻り値（`FirstTimeRegistration` / `MainMenu`）で遷移先を決めます。

## Firebase データ構造

```
/codes/{sha256(引き継ぎコード)} = { playerId, uid }     … コードを知る端末だけが読める。uid が現在の持ち主
/secrets/{playerId}            = sha256(引き継ぎコード) … 書き込み1回のみ・読み取り不可（ルール内の所有者判定用）
/profiles/{playerId}           = { name, icon, coins, parts, updatedAt }
/icons/{playerId}              = カスタムアイコン（96×96 JPEG の Base64）
/rankings/{stageId}/{playerId} = { name, icon, lapMs, achievedAt, mode, shortcuts }
/rooms/{roomId}                = { hostUid, maxPlayers, createdAt,
                                   players/{uid}: { name, ready, joinedAt },
                                   start: { stageId, aiCount, seed, nonce } }
```

### ランキングの仕組み
- 記録は1人1ステージにつき自己ベスト1件。ルールで「持ち主のみ」「前より速いときだけ」「ステージごとの下限タイム以上」を強制。
- クライアントは `orderByChild("lapMs").limitToFirst(100)` を購読するため、誰かが更新すると全員の画面で自動的に並び替わります。
- ショートカット判定（全チェックポイント通過、正規ショートカットのみ省略可）は `LapValidator` がクライアント側で行います。

### プロフィールと引き継ぎ
- 初回登録時に 16 文字の引き継ぎコードを自動発行。端末（PlayerPrefs）とサーバーの両方に保存します。
- 名前・アイコンを変えると、`/profiles` と記録のある全ステージの `/rankings` 行を1回のマルチパス更新で同時に書き換えます。ランキングを開いている全端末に即時反映されます。
- プレイヤー名は表示名です（1〜12文字、日本語可、重複可）。同一人物かどうかは `playerId` で区別します。
- 別端末でコードを入力すると、その端末が新しい持ち主になり、旧端末からは書き込めなくなります。

### ペイントエディタの方式
- 車体メッシュのUV空間へのテクスチャブレンドです。ペイント層とステッカーを元テクスチャに重ねて `_BaseMap` に割り当てます。
- 端末のフォルダから画像を選ぶ画面はOSごとのピッカー（NativeGallery 等、WebGL は `<input type="file">`）が別途必要です。選ばれたパスまたはバイト列を `AddStickerFromFile` / `AddStickerFromBytes` に渡します。

## 既知の制限・今後の課題

- **不正対策**：ショートカット判定がクライアント側のため、改造クライアントからの不正記録は下限タイムでしか防げません。本番運用では Cloud Functions での検証に移すことを推奨します。
- **ルーム定員**：12人上限はクライアント側チェックです（ルールでは子要素数を数えられないため）。
- **レース中の同期**：Firebase はロビーと開始合図まで。走行中の位置同期は別途実装が必要です。
- **ボルケーノ・コアのニトロショートカット**：アイテムが出ないタイムアタックでは無効扱い（VSのラップのみ有効）にしています。
- **引き継ぎコードの扱い**：コードを知っている人は誰でもデータを引き継げます。他人に見せないよう画面で案内してください。
- **コイン・解放パーツ**：クライアントから書き込めるため改ざん可能です。課金要素にする場合はサーバー側検証が必要です。
- **スキンの共有**：ペイントした車体は端末内保存のみ。対戦相手に見せるにはアップロード処理（Firebase Storage など）が必要です。
- **ステッカーの歪み**：UV空間に貼るため、UVの継ぎ目をまたぐ位置では絵が切れます。車体のUV展開を大きな面でまとめておくと目立ちません。
- **未着手**：キャラクター30体、設定画面（軽量化モード・BGM/SE・レイアウト編集UI）。レイアウトの保存先 `ControlLayout` だけ用意済みです。
- **ランキング圏外の順位**：上位100件に入っていない場合の正確な順位表示は未対応です。
- ステージの下限タイム・チェックポイント番号は仮の値です。コース完成後に `LapTracker.cs` と `database.rules.json` の両方を合わせて調整してください。
