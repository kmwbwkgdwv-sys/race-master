// RankingService.cs
// ステージ別・最速ラップタイムのグローバルランキング（Firebase Realtime Database）。
//   - /rankings/{stageId}/{playerId} に自己ベストのみ保存（改善時だけ書けるようルールで強制）
//   - lapMs 昇順のクエリを購読し、誰かがタイム・名前・アイコンを更新するたびに
//     並び替え済みの一覧が届く
//   - ローカル（PlayerPrefs）にも自己ベストを保持。オフライン中の送信は SDK が再接続時に同期する
// プレイヤーの識別・名前・アイコンは PlayerProfileService が管理する。

using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using Firebase.Database;
using UnityEngine;

namespace RaceMaster
{
    [Serializable]
    public class RankingEntry
    {
        public int rank;
        public string playerId;
        public string name;
        public string icon;      // "preset:xx" / "custom:{version}"（PlayerProfileService.GetCustomIconAsync で取得）
        public int lapMs;
        public long achievedAt;
        public bool isMe;
    }

    public enum SubmitStatus { Improved, NotImproved, InvalidLap, NoProfile, Rejected }

    public class RankingService : MonoBehaviour
    {
        public static RankingService Instance { get; private set; }

        /// <summary>購読中ステージのランキングが変わるたびに、速い順の一覧を通知する。</summary>
        public event Action<string, List<RankingEntry>> OnRankingUpdated;

        private Query liveQuery;
        private string liveStageId;

        private static PlayerProfileService Profile => PlayerProfileService.Instance;
        private static bool Ready => Profile != null && Profile.HasProfile && Profile.IsOnlineReady;
        private static DatabaseReference Rankings => FirebaseDatabase.DefaultInstance.GetReference("rankings");

        private void Awake()
        {
            if (Instance != null) { Destroy(gameObject); return; }
            Instance = this;
            DontDestroyOnLoad(gameObject);
        }

        private void OnDestroy() => Unsubscribe();

        // ------------------------------------------------------------------
        // 閲覧（リアルタイム）
        // ------------------------------------------------------------------

        /// <summary>ランキング画面でステージタブを選んだときに呼ぶ。</summary>
        public void Subscribe(string stageId, int top = 100)
        {
            Unsubscribe();
            if (Profile == null || !Profile.IsOnlineReady) return;
            liveStageId = stageId;
            liveQuery = Rankings.Child(stageId).OrderByChild("lapMs").LimitToFirst(top);
            liveQuery.ValueChanged += HandleValueChanged;
        }

        public void Unsubscribe()
        {
            if (liveQuery != null) liveQuery.ValueChanged -= HandleValueChanged;
            liveQuery = null;
            liveStageId = null;
        }

        private void HandleValueChanged(object sender, ValueChangedEventArgs args)
        {
            if (args.DatabaseError != null)
            {
                Debug.LogWarning("[Ranking] 取得エラー: " + args.DatabaseError.Message);
                return;
            }
            // Children は orderByChild("lapMs") の昇順（＝速い順）で列挙される
            string myId = Profile != null ? Profile.PlayerId : null;
            var list = new List<RankingEntry>();
            foreach (DataSnapshot child in args.Snapshot.Children)
            {
                list.Add(new RankingEntry
                {
                    rank = list.Count + 1,
                    playerId = child.Key,
                    name = child.Child("name").Value as string ?? "???",
                    icon = child.Child("icon").Value as string ?? "preset:01",
                    lapMs = Convert.ToInt32(child.Child("lapMs").Value ?? 0),
                    achievedAt = Convert.ToInt64(child.Child("achievedAt").Value ?? 0L),
                    isMe = child.Key == myId,
                });
            }
            OnRankingUpdated?.Invoke(liveStageId, list);
        }

        // ------------------------------------------------------------------
        // 記録送信
        // ------------------------------------------------------------------

        public int GetLocalBestMs(string stageId) => PlayerPrefs.GetInt("rm_best_" + stageId, 0);

        /// <summary>LapTracker.OnLapCompleted から呼ぶ。自己ベスト更新時のみサーバーへ保存する。</summary>
        public async Task<SubmitStatus> SubmitLapAsync(LapResult lap)
        {
            if (lap == null || !lap.isValid) return SubmitStatus.InvalidLap;

            int localBest = GetLocalBestMs(lap.stageId);
            if (localBest > 0 && lap.lapMs >= localBest) return SubmitStatus.NotImproved;

            // ローカルの自己ベストは通信状態に関係なく即更新
            PlayerPrefs.SetInt("rm_best_" + lap.stageId, lap.lapMs);
            PlayerPrefs.Save();

            if (!Ready) return SubmitStatus.NoProfile;

            var record = new Dictionary<string, object>
            {
                { "name", Profile.Profile.name },
                { "icon", Profile.Profile.icon },
                { "lapMs", lap.lapMs },
                { "achievedAt", ServerValue.Timestamp },
                { "mode", lap.mode == GameMode.TimeAttack ? "time_attack" : "vs" },
                { "shortcuts", string.Join(",", lap.shortcuts) },
            };
            try
            {
                // オフライン時、この Task は再接続して同期されるまで完了しない。UI は待たせないこと。
                await Rankings.Child(lap.stageId).Child(Profile.PlayerId).SetValueAsync(record);
                return SubmitStatus.Improved;
            }
            catch (Exception e)
            {
                // サーバー側の記録の方が速い場合や、別端末へ引き継ぎ済みの場合はルールで拒否される
                Debug.LogWarning("[Ranking] 送信が拒否されました: " + e.Message);
                return SubmitStatus.Rejected;
            }
        }
    }
}
