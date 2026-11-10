// FirebaseRoomService.cs
// ルーム（ロビー）の作成・参加・開始通知を Firebase Realtime Database で行う IRoomService 実装。
//   /rooms/{roomId} = { hostUid, maxPlayers, createdAt, players/{uid}: {name, ready, joinedAt}, start: {...} }
// ※ ここが扱うのはロビーと開始合図まで。レース中の位置同期は別レイヤーで実装する。

using System;
using System.Collections.Generic;
using System.Linq;
using Firebase.Auth;
using Firebase.Database;
using UnityEngine;

namespace RaceMaster
{
    public class FirebaseRoomService : MonoBehaviour, IRoomService
    {
        public bool IsHost { get; private set; }
        public IReadOnlyList<string> HumanPlayers => players;
        public event Action<string, int, int> RaceStartReceived;
        /// <summary>参加者一覧が変わったとき（ロビーUI更新用）。</summary>
        public event Action PlayersChanged;
        /// <summary>ホストがルームを閉じたとき。</summary>
        public event Action RoomClosed;

        [SerializeField] private string playerName = "PLAYER";

        private readonly List<string> players = new List<string>();
        private DatabaseReference roomRef;
        private string uid;
        private int maxPlayers = 12;
        private long lastStartNonce;

        public void SetPlayerName(string name) => playerName = name;

        public async void CreateRoom(string roomId, int max, Action<bool> onDone)
        {
            try
            {
                uid = FirebaseAuth.DefaultInstance.CurrentUser.UserId;
                maxPlayers = max;
                var reference = FirebaseDatabase.DefaultInstance.GetReference("rooms").Child(roomId);

                if ((await reference.GetValueAsync()).Exists) { onDone?.Invoke(false); return; } // ID衝突

                await reference.SetValueAsync(new Dictionary<string, object>
                {
                    { "hostUid", uid },
                    { "maxPlayers", max },
                    { "createdAt", ServerValue.Timestamp },
                    { "players", new Dictionary<string, object> { { uid, PlayerNode() } } },
                });
                await reference.OnDisconnect().RemoveValue(); // ホスト切断でルームごと消す
                IsHost = true;
                Attach(reference);
                onDone?.Invoke(true);
            }
            catch (Exception e)
            {
                Debug.LogWarning("[Room] 作成に失敗: " + e.Message);
                onDone?.Invoke(false);
            }
        }

        public async void JoinRoom(string roomId, Action<bool> onDone)
        {
            try
            {
                uid = FirebaseAuth.DefaultInstance.CurrentUser.UserId;
                var reference = FirebaseDatabase.DefaultInstance.GetReference("rooms").Child(roomId);
                var snap = await reference.GetValueAsync();
                if (!snap.Exists) { onDone?.Invoke(false); return; }

                maxPlayers = Convert.ToInt32(snap.Child("maxPlayers").Value ?? 12);
                if (snap.Child("players").ChildrenCount >= maxPlayers) { onDone?.Invoke(false); return; } // 満員

                var me = reference.Child("players").Child(uid);
                await me.SetValueAsync(PlayerNode());
                await me.OnDisconnect().RemoveValue();
                IsHost = false;
                Attach(reference);
                onDone?.Invoke(true);
            }
            catch (Exception e)
            {
                Debug.LogWarning("[Room] 参加に失敗: " + e.Message);
                onDone?.Invoke(false);
            }
        }

        public void LeaveRoom()
        {
            if (roomRef == null) return;
            var reference = roomRef;
            Detach();
            if (IsHost) { reference.OnDisconnect().Cancel(); reference.RemoveValueAsync(); }
            else
            {
                var me = reference.Child("players").Child(uid);
                me.OnDisconnect().Cancel();
                me.RemoveValueAsync();
            }
            IsHost = false;
            players.Clear();
        }

        public void SetReady(bool ready)
        {
            roomRef?.Child("players").Child(uid).Child("ready").SetValueAsync(ready);
        }

        public void BroadcastRaceStart(string stageId, int aiCount, int randomSeed)
        {
            if (roomRef == null || !IsHost) return;
            roomRef.Child("start").SetValueAsync(new Dictionary<string, object>
            {
                { "stageId", stageId },
                { "aiCount", aiCount },
                { "seed", randomSeed },
                { "nonce", ServerValue.Timestamp }, // 毎レース値が変わり、全員の ValueChanged が発火する
            });
        }

        // ------------------------------------------------------------------

        private Dictionary<string, object> PlayerNode() => new Dictionary<string, object>
        {
            { "name", playerName }, { "ready", false }, { "joinedAt", ServerValue.Timestamp },
        };

        private void Attach(DatabaseReference reference)
        {
            roomRef = reference;
            lastStartNonce = 0;
            roomRef.Child("players").ValueChanged += HandlePlayers;
            roomRef.Child("start").ValueChanged += HandleStart;
            roomRef.Child("hostUid").ValueChanged += HandleHost;
        }

        private void Detach()
        {
            if (roomRef == null) return;
            roomRef.Child("players").ValueChanged -= HandlePlayers;
            roomRef.Child("start").ValueChanged -= HandleStart;
            roomRef.Child("hostUid").ValueChanged -= HandleHost;
            roomRef = null;
        }

        private void HandlePlayers(object sender, ValueChangedEventArgs args)
        {
            if (args.DatabaseError != null) return;
            // 入室順に並べる（全端末で同じグリッド順になる）
            players.Clear();
            players.AddRange(args.Snapshot.Children
                .OrderBy(c => Convert.ToInt64(c.Child("joinedAt").Value ?? 0L))
                .ThenBy(c => c.Key)
                .Take(maxPlayers)
                .Select(c => c.Child("name").Value as string ?? "???"));
            PlayersChanged?.Invoke();
        }

        private void HandleStart(object sender, ValueChangedEventArgs args)
        {
            if (args.DatabaseError != null || !args.Snapshot.Exists) return;
            object rawNonce = args.Snapshot.Child("nonce").Value;
            if (rawNonce == null) return;
            long nonce = Convert.ToInt64(rawNonce);
            if (nonce == lastStartNonce) return;

            // ホスト自身の端末では ServerValue.Timestamp が「ローカル推定値 → サーバー確定値」の
            // 2回届くため、短い間隔の再通知は同じ開始合図として扱う
            bool duplicate = lastStartNonce != 0 && Math.Abs(nonce - lastStartNonce) < 5000;
            lastStartNonce = nonce;
            if (duplicate) return;

            RaceStartReceived?.Invoke(
                args.Snapshot.Child("stageId").Value as string,
                Convert.ToInt32(args.Snapshot.Child("aiCount").Value ?? 0),
                Convert.ToInt32(args.Snapshot.Child("seed").Value ?? 0));
        }

        private void HandleHost(object sender, ValueChangedEventArgs args)
        {
            if (args.DatabaseError != null || args.Snapshot.Exists || IsHost) return;
            Detach();
            players.Clear();
            RoomClosed?.Invoke();
        }

        private void OnDestroy() => LeaveRoom();
    }
}
