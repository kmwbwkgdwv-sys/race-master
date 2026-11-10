// GameModeManager.cs
// 1人プレイ（タイムアタック）とマルチプレイ（グランプリ / VS）の切り替え、
// およびゲーム全体のフェーズ遷移を管理する。
// 通信ミドルウェア（Photon / Netcode for GameObjects など）は IRoomService を実装して差し込む。

using System;
using System.Collections.Generic;
using UnityEngine;

namespace RaceMaster
{
    public enum GameMode
    {
        TimeAttack, // 1人専用・アイテムなし・最速ラップ狙い
        VsRace      // 最大12人（プレイヤー＋AI）・アイテムあり
    }

    public enum GamePhase { Menu, Lobby, Loading, Countdown, Racing, Results }

    /// <summary>モードごとのルール。HUD・アイテム・AI生成などはここだけを見て挙動を変える。</summary>
    [Serializable]
    public class GameModeRules
    {
        public GameMode mode;
        public int maxRacers;        // 出走台数の上限
        public bool itemsEnabled;    // ランダムコア（アイテム）を出すか
        public bool fillWithAI;      // 空き枠をAIで埋めるか
        public bool showPosition;    // 順位HUDを出すか
        public bool showGhostDelta;  // 自己ベストとの差分を出すか
        public int laps;             // 0 = 無制限（タイムアタックは自分でやめるまで周回）

        public static GameModeRules For(GameMode mode)
        {
            switch (mode)
            {
                case GameMode.TimeAttack:
                    return new GameModeRules
                    {
                        mode = mode, maxRacers = 1, itemsEnabled = false, fillWithAI = false,
                        showPosition = false, showGhostDelta = true, laps = 0
                    };
                default:
                    return new GameModeRules
                    {
                        mode = mode, maxRacers = 12, itemsEnabled = true, fillWithAI = true,
                        showPosition = true, showGhostDelta = false, laps = 3
                    };
            }
        }
    }

    /// <summary>スターティンググリッドの1枠。</summary>
    [Serializable]
    public struct RacerSlot
    {
        public int gridIndex;
        public bool isAI;
        public bool isLocalPlayer;
        public string displayName;
    }

    /// <summary>ルーム（ロビー）通信の抽象。オフライン時は null のままでよい。</summary>
    public interface IRoomService
    {
        bool IsHost { get; }
        /// <summary>ルーム内の人間プレイヤー名（自分を含む、入室順）。</summary>
        IReadOnlyList<string> HumanPlayers { get; }
        void CreateRoom(string roomId, int maxPlayers, Action<bool> onDone);
        void JoinRoom(string roomId, Action<bool> onDone);
        void LeaveRoom();
        /// <summary>ホストが全員にレース開始を通知する。</summary>
        void BroadcastRaceStart(string stageId, int aiCount, int randomSeed);
        /// <summary>ホストからの開始通知を受信したとき。</summary>
        event Action<string, int, int> RaceStartReceived;
    }

    public class GameModeManager : MonoBehaviour
    {
        public static GameModeManager Instance { get; private set; }

        public GameMode Mode { get; private set; } = GameMode.TimeAttack;
        public GameModeRules Rules { get; private set; } = GameModeRules.For(GameMode.TimeAttack);
        public GamePhase Phase { get; private set; } = GamePhase.Menu;
        public string StageId { get; private set; }
        public string RoomId { get; private set; }
        public bool IsOnline { get; private set; }
        public int RandomSeed { get; private set; }
        public IReadOnlyList<RacerSlot> Grid => grid;

        public event Action<GameModeRules> OnModeChanged;
        public event Action<GamePhase> OnPhaseChanged;
        /// <summary>ステージ読み込みを要求する（シーンローダーが購読）。</summary>
        public event Action<string> OnStageLoadRequested;

        [SerializeField] private string localPlayerName = "PLAYER";

        private readonly List<RacerSlot> grid = new List<RacerSlot>();
        private IRoomService room;

        // 紛らわしい文字（0/O, 1/I）を除いたルームID用文字
        private const string RoomIdChars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

        private void Awake()
        {
            if (Instance != null) { Destroy(gameObject); return; }
            Instance = this;
            DontDestroyOnLoad(gameObject);
            LockLandscape();
        }

        /// <summary>画面を横向き（左右どちらも可）に固定する。</summary>
        private static void LockLandscape()
        {
            Screen.autorotateToPortrait = false;
            Screen.autorotateToPortraitUpsideDown = false;
            Screen.autorotateToLandscapeLeft = true;
            Screen.autorotateToLandscapeRight = true;
            Screen.orientation = ScreenOrientation.AutoRotation;
            Screen.sleepTimeout = SleepTimeout.NeverSleep;
        }

        public void SetLocalPlayerName(string userId) => localPlayerName = userId;

        public void SetRoomService(IRoomService service)
        {
            if (room != null) room.RaceStartReceived -= HandleRaceStartReceived;
            room = service;
            if (room != null) room.RaceStartReceived += HandleRaceStartReceived;
        }

        // ------------------------------------------------------------------
        // モード選択
        // ------------------------------------------------------------------

        /// <summary>タイムアタック開始（1人・アイテムなし）。</summary>
        public void StartTimeAttack(string stageId)
        {
            LeaveRoomIfAny();
            SetMode(GameMode.TimeAttack, online: false);
            BeginLoading(stageId, aiCount: 0, seed: NewSeed());
        }

        /// <summary>オフラインで自分＋AI 11台のVSレースを開始。</summary>
        public void StartSoloVs(string stageId)
        {
            LeaveRoomIfAny();
            SetMode(GameMode.VsRace, online: false);
            BeginLoading(stageId, aiCount: Rules.maxRacers - 1, seed: NewSeed());
        }

        /// <summary>ホストとしてルームを作成し、ロビーへ。成功時に共有用ルームIDを返す。</summary>
        public void CreateVsRoom(Action<bool, string> onDone)
        {
            if (room == null) { onDone?.Invoke(false, null); return; }
            SetMode(GameMode.VsRace, online: true);
            string id = GenerateRoomId();
            room.CreateRoom(id, Rules.maxRacers, ok =>
            {
                if (ok) { RoomId = id; SetPhase(GamePhase.Lobby); }
                else ReturnToMenu();
                onDone?.Invoke(ok, ok ? id : null);
            });
        }

        /// <summary>共有されたルームIDで参加し、ロビーへ。</summary>
        public void JoinVsRoom(string roomId, Action<bool> onDone)
        {
            if (room == null || string.IsNullOrWhiteSpace(roomId)) { onDone?.Invoke(false); return; }
            string id = roomId.Trim().ToUpperInvariant();
            SetMode(GameMode.VsRace, online: true);
            room.JoinRoom(id, ok =>
            {
                if (ok) { RoomId = id; SetPhase(GamePhase.Lobby); }
                else ReturnToMenu();
                onDone?.Invoke(ok);
            });
        }

        /// <summary>ロビーでホストが「レース開始」を押したとき。空き枠はAIで埋める。</summary>
        public bool HostStartRace(string stageId)
        {
            if (Phase != GamePhase.Lobby || room == null || !room.IsHost) return false;
            int humans = Mathf.Clamp(room.HumanPlayers.Count, 1, Rules.maxRacers);
            int aiCount = Rules.fillWithAI ? Rules.maxRacers - humans : 0;
            // 全員（ホスト自身を含む）が RaceStartReceived 経由で同じ内容を受け取る想定
            room.BroadcastRaceStart(stageId, aiCount, NewSeed());
            return true;
        }

        private void HandleRaceStartReceived(string stageId, int aiCount, int seed)
        {
            if (Mode != GameMode.VsRace || !IsOnline) return;
            BeginLoading(stageId, aiCount, seed);
        }

        // ------------------------------------------------------------------
        // フェーズ遷移（レース進行側から呼ぶ）
        // ------------------------------------------------------------------

        public void NotifyStageLoaded()    { if (Phase == GamePhase.Loading) SetPhase(GamePhase.Countdown); }
        public void NotifyCountdownDone()  { if (Phase == GamePhase.Countdown) SetPhase(GamePhase.Racing); }
        public void NotifyRaceFinished()   { if (Phase == GamePhase.Racing) SetPhase(GamePhase.Results); }

        /// <summary>リザルト後。オンラインならロビーへ、オフラインならメニューへ戻る。</summary>
        public void LeaveResults()
        {
            if (IsOnline && room != null) SetPhase(GamePhase.Lobby);
            else ReturnToMenu();
        }

        public void ReturnToMenu()
        {
            LeaveRoomIfAny();
            IsOnline = false;
            grid.Clear();
            SetPhase(GamePhase.Menu);
        }

        // ------------------------------------------------------------------
        // 内部処理
        // ------------------------------------------------------------------

        private void SetMode(GameMode mode, bool online)
        {
            Mode = mode;
            Rules = GameModeRules.For(mode);
            IsOnline = online;
            OnModeChanged?.Invoke(Rules);
        }

        private void SetPhase(GamePhase next)
        {
            if (Phase == next) return;
            Phase = next;
            OnPhaseChanged?.Invoke(next);
        }

        private void BeginLoading(string stageId, int aiCount, int seed)
        {
            StageId = stageId;
            RandomSeed = seed;
            BuildGrid(aiCount);
            SetPhase(GamePhase.Loading);
            OnStageLoadRequested?.Invoke(stageId);
        }

        /// <summary>人間 → AI の順にグリッドを組む。全端末で同じ並びになる。</summary>
        private void BuildGrid(int aiCount)
        {
            grid.Clear();
            if (IsOnline && room != null)
            {
                foreach (string name in room.HumanPlayers)
                {
                    if (grid.Count >= Rules.maxRacers) break;
                    grid.Add(new RacerSlot
                    {
                        gridIndex = grid.Count, isAI = false,
                        isLocalPlayer = name == localPlayerName, displayName = name
                    });
                }
            }
            else
            {
                grid.Add(new RacerSlot { gridIndex = 0, isAI = false, isLocalPlayer = true, displayName = localPlayerName });
            }

            for (int i = 0; i < aiCount && grid.Count < Rules.maxRacers; i++)
            {
                grid.Add(new RacerSlot
                {
                    gridIndex = grid.Count, isAI = true, isLocalPlayer = false,
                    displayName = "CPU " + (i + 1)
                });
            }
        }

        private void LeaveRoomIfAny()
        {
            if (RoomId != null && room != null) room.LeaveRoom();
            RoomId = null;
        }

        private static int NewSeed() => UnityEngine.Random.Range(1, int.MaxValue);

        private static string GenerateRoomId(int length = 6)
        {
            var chars = new char[length];
            for (int i = 0; i < length; i++)
                chars[i] = RoomIdChars[UnityEngine.Random.Range(0, RoomIdChars.Length)];
            return new string(chars);
        }
    }
}
