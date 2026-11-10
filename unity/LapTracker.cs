// LapTracker.cs
// ステージ定義（5ステージ・ショートカット含む）と、1周ごとのラップ計測・ショートカット判定。
// カートに付け、CheckpointTrigger から PassCheckpoint / PassShortcutGate が呼ばれる。

using System;
using System.Collections.Generic;
using UnityEngine;

namespace RaceMaster
{
    [Serializable]
    public class ShortcutDef
    {
        public string id;
        public bool expert;        // false = 一目でわかる初心者向け / true = 上級者向け隠しルート
        public int[] skips;        // 通ると踏まなくてよいチェックポイント番号
        public bool requiresItem;  // ニトロ・カプセル必須（アイテムの出ないタイムアタックでは無効）
    }

    [Serializable]
    public class StageDef
    {
        public string id;
        public string displayName;
        public int checkpoints;    // 0番はスタート/ゴールライン
        public int minLapMs;       // これより速い記録は送信しない（database.rules.json と同じ値にする）
        public int maxFreeSkip;    // 宣言なしで連続して飛ばしてよい数（壁のないコース用）
        public ShortcutDef[] shortcuts;
    }

    public static class StageCatalog
    {
        public static readonly StageDef[] All =
        {
            new StageDef { id = "master_circuit", displayName = "マスター・サーキット", checkpoints = 12, minLapMs = 25000, maxFreeSkip = 0,
                shortcuts = new[] {
                    new ShortcutDef { id = "mc_grass_cut", expert = false, skips = new[] { 4 } },
                    new ShortcutDef { id = "mc_pit_jump", expert = true, skips = new[] { 8, 9 } } } },
            new StageDef { id = "neon_metropolis", displayName = "ネオン・メトロポリス", checkpoints = 16, minLapMs = 35000, maxFreeSkip = 0,
                shortcuts = new[] {
                    new ShortcutDef { id = "nm_ramp", expert = false, skips = new[] { 3 } },
                    new ShortcutDef { id = "nm_rooftop_leap", expert = true, skips = new[] { 9, 10, 11 } } } },
            new StageDef { id = "ancient_desert", displayName = "古代の砂漠", checkpoints = 14, minLapMs = 32000, maxFreeSkip = 0,
                shortcuts = new[] {
                    new ShortcutDef { id = "ad_ruin_gate", expert = false, skips = new[] { 5 } },
                    new ShortcutDef { id = "ad_dust_tunnel", expert = true, skips = new[] { 10, 11 } } } },
            new StageDef { id = "volcano_core", displayName = "ボルケーノ・コア", checkpoints = 14, minLapMs = 34000, maxFreeSkip = 0,
                shortcuts = new[] {
                    new ShortcutDef { id = "vc_rock_bridge", expert = false, skips = new[] { 2 } },
                    new ShortcutDef { id = "vc_lava_nitro_jump", expert = true, skips = new[] { 7, 8, 9 }, requiresItem = true } } },
            new StageDef { id = "cosmo_skyway", displayName = "コスモ・スカイウェイ", checkpoints = 18, minLapMs = 38000, maxFreeSkip = 2,
                shortcuts = new[] {
                    new ShortcutDef { id = "cs_inner_hop", expert = false, skips = new[] { 4 } },
                    new ShortcutDef { id = "cs_void_dive", expert = true, skips = new[] { 11, 12, 13, 14 } } } },
        };

        public static StageDef Find(string id)
        {
            foreach (var s in All) if (s.id == id) return s;
            return null;
        }
    }

    public class LapResult
    {
        public string stageId;
        public int lapMs;
        public GameMode mode;
        public List<int> passed = new List<int>();
        public List<string> shortcuts = new List<string>();
        public bool isValid;
        public string invalidReason = "";
    }

    public static class LapValidator
    {
        /// <summary>全チェックポイントを通ったか（正規ショートカットによる省略は許可）を判定する。</summary>
        public static bool Validate(StageDef stage, LapResult lap, out string reason)
        {
            reason = "";
            if (lap.lapMs < stage.minLapMs) { reason = "lap_too_fast"; return false; }
            if (lap.passed.Count == 0 || lap.passed[0] != 0) { reason = "must_start_at_checkpoint_0"; return false; }

            var allowed = new HashSet<int>();
            foreach (string id in lap.shortcuts)
            {
                ShortcutDef sc = Array.Find(stage.shortcuts, s => s.id == id);
                if (sc == null) { reason = "unknown_shortcut"; return false; }
                if (sc.requiresItem && lap.mode == GameMode.TimeAttack) { reason = "shortcut_requires_item"; return false; }
                foreach (int cp in sc.skips) allowed.Add(cp);
            }

            var passed = new HashSet<int>(lap.passed);
            int freeRun = 0;
            for (int cp = 0; cp < stage.checkpoints; cp++)
            {
                if (passed.Contains(cp)) { freeRun = 0; continue; }
                if (allowed.Contains(cp)) continue;
                if (++freeRun > stage.maxFreeSkip) { reason = "missed_checkpoint"; return false; }
            }
            return true;
        }
    }

    public class LapTracker : MonoBehaviour
    {
        public event Action<LapResult> OnLapCompleted;

        public int LapCount { get; private set; }
        public int BestLapMs { get; private set; }
        /// <summary>最後に踏んだチェックポイント。救助ドローンの復帰地点に使う。</summary>
        public int LastCheckpoint { get; private set; }
        public float CurrentLapSeconds => running ? (float)(Time.timeAsDouble - lapStart) : 0f;

        private StageDef stage;
        private GameMode mode;
        private bool running;
        private double lapStart;
        private readonly List<int> passed = new List<int>();
        private readonly HashSet<string> usedShortcuts = new HashSet<string>();

        public void Begin(string stageId, GameMode gameMode)
        {
            stage = StageCatalog.Find(stageId);
            mode = gameMode;
            running = false;
            LapCount = 0;
            BestLapMs = 0;
            LastCheckpoint = 0;
            passed.Clear();
            usedShortcuts.Clear();
        }

        public void PassCheckpoint(int index)
        {
            if (stage == null) return;

            if (index == 0)
            {
                // 逆走でラインをまたいだだけの場合は無視（半分以上進んでいることを要求）
                if (running && LastCheckpoint >= stage.checkpoints / 2) FinishLap();
                if (!running || passed.Count != 1) StartLap();
                return;
            }
            if (!running || index <= LastCheckpoint) return; // 逆走・重複は記録しない
            passed.Add(index);
            LastCheckpoint = index;
        }

        public void PassShortcutGate(string shortcutId)
        {
            if (running) usedShortcuts.Add(shortcutId);
        }

        private void StartLap()
        {
            running = true;
            lapStart = Time.timeAsDouble;
            passed.Clear();
            passed.Add(0);
            usedShortcuts.Clear();
            LastCheckpoint = 0;
        }

        private void FinishLap()
        {
            var lap = new LapResult
            {
                stageId = stage.id,
                mode = mode,
                lapMs = Mathf.RoundToInt((float)((Time.timeAsDouble - lapStart) * 1000.0)),
            };
            lap.passed.AddRange(passed);
            lap.shortcuts.AddRange(usedShortcuts);
            lap.isValid = LapValidator.Validate(stage, lap, out lap.invalidReason);

            LapCount++;
            if (lap.isValid && (BestLapMs == 0 || lap.lapMs < BestLapMs)) BestLapMs = lap.lapMs;
            running = false;
            OnLapCompleted?.Invoke(lap);
        }
    }
}
