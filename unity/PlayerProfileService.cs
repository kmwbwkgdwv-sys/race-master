// PlayerProfileService.cs
// 初回登録 → 引き継ぎコード自動発行 → 2回目以降スキップ、およびプロフィール同期。
//
// 起動時の流れ（起動シーンから BootAsync を呼ぶ）
//   BootRoute.FirstTimeRegistration : 「プレイヤー名」「初期アイコン」設定画面を出す
//        → RegisterAsync(name, icon) が引き継ぎコードを返す
//        → コード表示画面で CopyTransferCodeToClipboard() → メインメニューへ
//   BootRoute.MainMenu : 端末にデータがあるので登録・コード画面を出さず直接メニューへ
//
// 名前・アイコン変更
//   UpdateProfileAsync が /profiles と、記録のある全ステージの /rankings を
//   1回のマルチパス更新でまとめて書き換える。ランキングを購読中の全端末に即時反映される。
//
// 引き継ぎの仕組み（アカウント不要）
//   コード（16文字）の SHA-256 を鍵にして /codes/{hash} = { playerId, uid } を保存。
//   新端末でコードを入力すると uid を自分の匿名認証uidに書き換え、以後その端末が持ち主になる。

using System;
using System.Collections.Generic;
using System.IO;
using System.Security.Cryptography;
using System.Text;
using System.Threading.Tasks;
using Firebase;
using Firebase.Auth;
using Firebase.Database;
using UnityEngine;

namespace RaceMaster
{
    public enum BootRoute { FirstTimeRegistration, MainMenu }

    [Serializable]
    public class LocalProfile
    {
        public string playerId;
        public string name;
        public string icon;          // "preset:03" または "custom:{version}"
        public string transferCode;
        public int coins;
        public List<string> unlockedParts = new List<string>();
        public bool serverSynced;    // false の間は次回起動時などに再送する
    }

    public class PlayerProfileService : MonoBehaviour
    {
        public static PlayerProfileService Instance { get; private set; }

        public const int MaxNameLength = 12;
        private const string PrefKey = "rm_profile";
        private const string CodeChars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 紛らわしい文字を除外
        private const int CustomIconSize = 96;

        public LocalProfile Profile { get; private set; }
        public bool HasProfile => Profile != null && !string.IsNullOrEmpty(Profile.playerId);
        public bool IsOnlineReady { get; private set; }
        public string PlayerId => Profile?.playerId;

        /// <summary>名前・アイコンが変わったとき（左上アイコンなどのUI更新用）。</summary>
        public event Action<LocalProfile> OnProfileChanged;

        private DatabaseReference root;
        private string uid;
        private readonly Dictionary<string, Texture2D> iconCache = new Dictionary<string, Texture2D>();

        private static string CustomIconPath => Path.Combine(Application.persistentDataPath, "custom_icon.jpg");

        private void Awake()
        {
            if (Instance != null) { Destroy(gameObject); return; }
            Instance = this;
            DontDestroyOnLoad(gameObject);
        }

        // ------------------------------------------------------------------
        // 起動
        // ------------------------------------------------------------------

        /// <summary>起動時に1回呼ぶ。端末にデータがあれば MainMenu を返す（登録画面は完全にスキップ）。</summary>
        public async Task<BootRoute> BootAsync()
        {
            LoadLocal();
            await InitializeFirebaseAsync(); // オフラインでも先へ進む

            if (!HasProfile) return BootRoute.FirstTimeRegistration;

            if (!Profile.serverSynced) _ = PushToServerAsync(); // 前回送れなかった分を裏で再送
            return BootRoute.MainMenu;
        }

        private async Task<bool> InitializeFirebaseAsync()
        {
            if (IsOnlineReady) return true;
            try
            {
                if (await FirebaseApp.CheckAndFixDependenciesAsync() != DependencyStatus.Available) return false;
                FirebaseAuth auth = FirebaseAuth.DefaultInstance;
                if (auth.CurrentUser == null) await auth.SignInAnonymouslyAsync();
                uid = auth.CurrentUser.UserId;
                root = FirebaseDatabase.DefaultInstance.RootReference;
                IsOnlineReady = true;
                return true;
            }
            catch (Exception e)
            {
                Debug.LogWarning("[Profile] Firebase 初期化に失敗（オフラインで続行）: " + e.Message);
                return false;
            }
        }

        // ------------------------------------------------------------------
        // 初回登録
        // ------------------------------------------------------------------

        /// <summary>プレイヤー名と初期アイコンを決定した直後に呼ぶ。発行した引き継ぎコードを返す。</summary>
        public async Task<string> RegisterAsync(string playerName, string iconId)
        {
            if (HasProfile) return Profile.transferCode;

            Profile = new LocalProfile
            {
                playerId = Guid.NewGuid().ToString("N"),
                name = SanitizeName(playerName),
                icon = string.IsNullOrEmpty(iconId) ? "preset:01" : iconId,
                transferCode = GenerateTransferCode(),
                serverSynced = false,
            };
            SaveLocal();                 // 先に端末へ保存（通信失敗でも登録は完了扱い）
            await PushToServerAsync();   // サーバーへ同期
            OnProfileChanged?.Invoke(Profile);
            return Profile.transferCode;
        }

        /// <summary>コード表示画面の「保存」ボタン用。</summary>
        public void CopyTransferCodeToClipboard()
        {
            if (HasProfile) GUIUtility.systemCopyBuffer = Profile.transferCode;
        }

        // ------------------------------------------------------------------
        // プロフィール変更（ランキングへ一括反映）
        // ------------------------------------------------------------------

        /// <summary>名前・アイコンを変更する。iconId が null ならアイコンは据え置き。</summary>
        public async Task<bool> UpdateProfileAsync(string playerName, string iconId = null)
        {
            if (!HasProfile) return false;
            Profile.name = SanitizeName(playerName);
            if (!string.IsNullOrEmpty(iconId)) Profile.icon = iconId;
            Profile.serverSynced = false;
            SaveLocal();
            OnProfileChanged?.Invoke(Profile);
            return await PushToServerAsync();
        }

        /// <summary>端末から読み込んだ画像をカスタムアイコンとして保存し、プロフィールに設定する。</summary>
        public async Task<bool> SetCustomIconAsync(Texture2D source)
        {
            if (!HasProfile || source == null) return false;

            byte[] jpg = ToSquareJpg(source, CustomIconSize);
            File.WriteAllBytes(CustomIconPath, jpg);

            string iconId = "custom:" + DateTimeOffset.UtcNow.ToUnixTimeSeconds();
            if (IsOnlineReady)
            {
                try { await root.Child("icons").Child(Profile.playerId).SetValueAsync(Convert.ToBase64String(jpg)); }
                catch (Exception e) { Debug.LogWarning("[Profile] アイコン送信に失敗: " + e.Message); }
            }
            return await UpdateProfileAsync(Profile.name, iconId);
        }

        public void AddCoins(int amount)
        {
            if (!HasProfile) return;
            Profile.coins = Mathf.Max(0, Profile.coins + amount);
            MarkDirtyAndPush();
        }

        public void UnlockPart(string partId)
        {
            if (!HasProfile || Profile.unlockedParts.Contains(partId)) return;
            Profile.unlockedParts.Add(partId);
            MarkDirtyAndPush();
        }

        private void MarkDirtyAndPush()
        {
            Profile.serverSynced = false;
            SaveLocal();
            _ = PushToServerAsync();
        }

        /// <summary>
        /// プロフィールと、記録のある全ステージのランキング行（名前・アイコン）を1回の更新で書き換える。
        /// </summary>
        private async Task<bool> PushToServerAsync()
        {
            if (!HasProfile || !await InitializeFirebaseAsync()) return false;
            string pid = Profile.playerId;
            try
            {
                // 所有権の登録（初回のみ書く。secrets は2回目以降ルールで拒否されるので無視）
                string hash = Sha256Hex(Profile.transferCode);
                DatabaseReference codeRef = root.Child("codes").Child(hash);
                DataSnapshot owner = await codeRef.GetValueAsync();
                if (!owner.Exists)
                {
                    await codeRef.SetValueAsync(new Dictionary<string, object> { { "playerId", pid }, { "uid", uid } });
                }
                else if ((owner.Child("uid").Value as string) != uid)
                {
                    Debug.LogWarning("[Profile] このデータは別の端末へ引き継ぎ済みです。");
                    return false;
                }
                try { await root.Child("secrets").Child(pid).SetValueAsync(hash); } catch { /* 登録済み */ }

                var updates = new Dictionary<string, object>
                {
                    { $"profiles/{pid}/name", Profile.name },
                    { $"profiles/{pid}/icon", Profile.icon },
                    { $"profiles/{pid}/coins", Profile.coins },
                    { $"profiles/{pid}/parts", string.Join(",", Profile.unlockedParts) },
                    { $"profiles/{pid}/updatedAt", ServerValue.Timestamp },
                };

                // 過去のタイムに付いている名前・アイコンも同時に更新する
                foreach (StageDef stage in StageCatalog.All)
                {
                    DataSnapshot record = await root.Child("rankings").Child(stage.id).Child(pid).GetValueAsync();
                    if (!record.Exists) continue;
                    updates[$"rankings/{stage.id}/{pid}/name"] = Profile.name;
                    updates[$"rankings/{stage.id}/{pid}/icon"] = Profile.icon;
                }

                await root.UpdateChildrenAsync(updates); // 全パスが同時に成功 or 失敗する
                Profile.serverSynced = true;
                SaveLocal();
                return true;
            }
            catch (Exception e)
            {
                Debug.LogWarning("[Profile] サーバー同期に失敗（次回再送）: " + e.Message);
                return false;
            }
        }

        // ------------------------------------------------------------------
        // 引き継ぎコードで復元（別端末・再インストール時）
        // ------------------------------------------------------------------

        public async Task<bool> RestoreFromCodeAsync(string inputCode)
        {
            string code = NormalizeCode(inputCode);
            if (code == null || !await InitializeFirebaseAsync()) return false;
            try
            {
                DatabaseReference codeRef = root.Child("codes").Child(Sha256Hex(code));
                DataSnapshot snap = await codeRef.GetValueAsync();
                if (!snap.Exists) return false; // コードが違う

                string pid = snap.Child("playerId").Value as string;
                await codeRef.Child("uid").SetValueAsync(uid); // この端末を持ち主にする（旧端末は書き込み不可になる）

                DataSnapshot p = await root.Child("profiles").Child(pid).GetValueAsync();
                Profile = new LocalProfile
                {
                    playerId = pid,
                    name = p.Child("name").Value as string ?? "PLAYER",
                    icon = p.Child("icon").Value as string ?? "preset:01",
                    transferCode = code,
                    coins = Convert.ToInt32(p.Child("coins").Value ?? 0),
                    serverSynced = true,
                };
                string parts = p.Child("parts").Value as string;
                if (!string.IsNullOrEmpty(parts)) Profile.unlockedParts.AddRange(parts.Split(','));

                // 自己ベストも端末へ戻す
                foreach (StageDef stage in StageCatalog.All)
                {
                    DataSnapshot r = await root.Child("rankings").Child(stage.id).Child(pid).Child("lapMs").GetValueAsync();
                    if (r.Exists) PlayerPrefs.SetInt("rm_best_" + stage.id, Convert.ToInt32(r.Value));
                }

                SaveLocal();
                OnProfileChanged?.Invoke(Profile);
                return true;
            }
            catch (Exception e)
            {
                Debug.LogWarning("[Profile] 復元に失敗: " + e.Message);
                return false;
            }
        }

        // ------------------------------------------------------------------
        // アイコン取得（ランキング行・ロビー表示用）
        // ------------------------------------------------------------------

        /// <summary>
        /// カスタムアイコンのテクスチャを返す。"preset:xx" の場合は null（UI側で内蔵スプライトを使う）。
        /// </summary>
        public async Task<Texture2D> GetCustomIconAsync(string playerId, string iconId)
        {
            if (string.IsNullOrEmpty(iconId) || !iconId.StartsWith("custom:")) return null;

            string key = playerId + "/" + iconId; // バージョン込みなので変更時は自動で取り直す
            if (iconCache.TryGetValue(key, out Texture2D cached)) return cached;

            byte[] bytes = null;
            if (playerId == PlayerId && File.Exists(CustomIconPath)) bytes = File.ReadAllBytes(CustomIconPath);
            else if (IsOnlineReady)
            {
                try
                {
                    DataSnapshot snap = await root.Child("icons").Child(playerId).GetValueAsync();
                    if (snap.Exists) bytes = Convert.FromBase64String(snap.Value as string ?? "");
                }
                catch (Exception e) { Debug.LogWarning("[Profile] アイコン取得に失敗: " + e.Message); }
            }
            if (bytes == null || bytes.Length == 0) return null;

            var tex = new Texture2D(2, 2);
            if (!tex.LoadImage(bytes)) { Destroy(tex); return null; }
            iconCache[key] = tex;
            return tex;
        }

        // ------------------------------------------------------------------
        // ローカル保存・ユーティリティ
        // ------------------------------------------------------------------

        private void LoadLocal()
        {
            string json = PlayerPrefs.GetString(PrefKey, "");
            Profile = string.IsNullOrEmpty(json) ? null : JsonUtility.FromJson<LocalProfile>(json);
        }

        private void SaveLocal()
        {
            PlayerPrefs.SetString(PrefKey, JsonUtility.ToJson(Profile));
            PlayerPrefs.Save();
        }

        private static string SanitizeName(string raw)
        {
            string s = (raw ?? "").Trim();
            if (s.Length == 0) s = "PLAYER";
            return s.Length > MaxNameLength ? s.Substring(0, MaxNameLength) : s;
        }

        /// <summary>XXXX-XXXX-XXXX-XXXX 形式（80ビット相当）のコードを暗号論的乱数で生成する。</summary>
        private static string GenerateTransferCode()
        {
            var bytes = new byte[16];
            using (var rng = RandomNumberGenerator.Create()) rng.GetBytes(bytes);
            var sb = new StringBuilder(19);
            for (int i = 0; i < 16; i++)
            {
                if (i > 0 && i % 4 == 0) sb.Append('-');
                sb.Append(CodeChars[bytes[i] % CodeChars.Length]); // 256 は 32 で割り切れるので偏りなし
            }
            return sb.ToString();
        }

        /// <summary>入力ゆれ（小文字・ハイフンなし・空白）を吸収する。不正な形式は null。</summary>
        private static string NormalizeCode(string input)
        {
            if (string.IsNullOrEmpty(input)) return null;
            var sb = new StringBuilder(19);
            int count = 0;
            foreach (char raw in input.ToUpperInvariant())
            {
                if (CodeChars.IndexOf(raw) < 0) continue;
                if (count > 0 && count % 4 == 0) sb.Append('-');
                sb.Append(raw);
                count++;
            }
            return count == 16 ? sb.ToString() : null;
        }

        private static string Sha256Hex(string text)
        {
            using (SHA256 sha = SHA256.Create())
            {
                byte[] hash = sha.ComputeHash(Encoding.UTF8.GetBytes(text));
                var sb = new StringBuilder(64);
                foreach (byte b in hash) sb.Append(b.ToString("x2"));
                return sb.ToString();
            }
        }

        private static byte[] ToSquareJpg(Texture2D source, int size)
        {
            // 中央を正方形に切り出して縮小
            int side = Mathf.Min(source.width, source.height);
            var scale = new Vector2((float)side / source.width, (float)side / source.height);
            var offset = new Vector2((1f - scale.x) * 0.5f, (1f - scale.y) * 0.5f);

            RenderTexture rt = RenderTexture.GetTemporary(size, size, 0, RenderTextureFormat.ARGB32);
            Graphics.Blit(source, rt, scale, offset);
            RenderTexture previous = RenderTexture.active;
            RenderTexture.active = rt;
            var tex = new Texture2D(size, size, TextureFormat.RGB24, false);
            tex.ReadPixels(new Rect(0, 0, size, size), 0, 0);
            RenderTexture.active = previous;
            RenderTexture.ReleaseTemporary(rt);

            byte[] jpg = tex.EncodeToJPG(80);
            Destroy(tex);
            return jpg;
        }
    }
}
