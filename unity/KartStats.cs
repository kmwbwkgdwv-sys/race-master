// KartStats.cs
// 4つのカスタムパーツ（フレーム / ホイール / ウィング / エンジン）と、
// その組み合わせから算出されるマシンステータス。
// パーツの各数値は 0〜10 のポイントで入力し、KartStatsCalculator が物理値に変換する。

using System;
using UnityEngine;

namespace RaceMaster
{
    public abstract class KartPart : ScriptableObject
    {
        public string partId;
        public string displayName;
        public Sprite icon;
        public int price;            // 解放に必要なコイン
    }

    /// <summary>【フレーム】重さ・ハンドリング・耐久性</summary>
    [CreateAssetMenu(menuName = "RaceMaster/Parts/Frame")]
    public class FramePart : KartPart
    {
        [Range(0, 10)] public float weight = 5;
        [Range(0, 10)] public float handling = 5;
        [Range(0, 10)] public float durability = 5;
    }

    /// <summary>【ホイール】悪路耐性・ドリフト時の横滑りしにくさ</summary>
    [CreateAssetMenu(menuName = "RaceMaster/Parts/Wheel")]
    public class WheelPart : KartPart
    {
        [Range(0, 10)] public float offroad = 5;
        [Range(0, 10)] public float driftGrip = 5;
    }

    /// <summary>【ウィング】空中での飛行速度・滞空時間・制御力</summary>
    [CreateAssetMenu(menuName = "RaceMaster/Parts/Wing")]
    public class WingPart : KartPart
    {
        [Range(0, 10)] public float airSpeed = 5;
        [Range(0, 10)] public float airTime = 5;
        [Range(0, 10)] public float airControl = 5;
    }

    /// <summary>【エンジン】最高速度・加速力・ミニターボ持続時間</summary>
    [CreateAssetMenu(menuName = "RaceMaster/Parts/Engine")]
    public class EnginePart : KartPart
    {
        [Range(0, 10)] public float topSpeed = 5;
        [Range(0, 10)] public float acceleration = 5;
        [Range(0, 10)] public float miniTurbo = 5;
    }

    [Serializable]
    public class KartLoadout
    {
        public FramePart frame;
        public WheelPart wheel;
        public WingPart wing;
        public EnginePart engine;
    }

    /// <summary>走行ロジックが直接使う最終ステータス。</summary>
    [Serializable]
    public struct KartStats
    {
        // 仕様の6ステータス
        public float topSpeed;          // 最高速度 (m/s)
        public float acceleration;      // 加速 (m/s^2)
        public float handling;          // ハンドリング：最大旋回速度 (deg/s)
        public float mass;              // 重さ (kg)。接触時の押し負けにくさ
        public float offroad;           // 悪路耐性 0〜1（1で悪路でも減速なし）
        public float miniTurboDuration; // ミニターボ持続時間の倍率

        // 補助ステータス
        public float driftGrip;         // 0〜1。高いほどドリフト中に外へ膨らまない
        public float durability;        // 0〜1。被弾時の減速・硬直の軽減率
        public float airSpeed;          // 滑空速度の倍率
        public float airTime;           // 滑空中の重力倍率（小さいほど長く飛ぶ）
        public float airControl;        // 空中旋回速度 (deg/s)
    }

    public static class KartStatsCalculator
    {
        public static KartStats Compute(KartLoadout l)
        {
            // 未装備スロットは平均値(5)として扱う
            float fW = l?.frame ? l.frame.weight : 5, fH = l?.frame ? l.frame.handling : 5, fD = l?.frame ? l.frame.durability : 5;
            float wO = l?.wheel ? l.wheel.offroad : 5, wG = l?.wheel ? l.wheel.driftGrip : 5;
            float gS = l?.wing ? l.wing.airSpeed : 5, gT = l?.wing ? l.wing.airTime : 5, gC = l?.wing ? l.wing.airControl : 5;
            float eS = l?.engine ? l.engine.topSpeed : 5, eA = l?.engine ? l.engine.acceleration : 5, eM = l?.engine ? l.engine.miniTurbo : 5;

            // 重さの偏り：-0.5（最軽量）〜 +0.5（最重量）
            // 重いほど最高速がわずかに伸び、加速とハンドリングが落ちる
            float heavy = fW / 10f - 0.5f;

            return new KartStats
            {
                topSpeed = Mathf.Lerp(22f, 34f, eS / 10f) * (1f + 0.06f * heavy),
                acceleration = Mathf.Lerp(10f, 22f, eA / 10f) * (1f - 0.30f * heavy),
                handling = Mathf.Lerp(55f, 95f, fH / 10f) * (1f - 0.20f * heavy),
                mass = Mathf.Lerp(80f, 200f, fW / 10f),
                offroad = Mathf.Clamp01(wO / 10f),
                miniTurboDuration = Mathf.Lerp(0.8f, 1.4f, eM / 10f),

                driftGrip = Mathf.Clamp01(wG / 10f),
                durability = Mathf.Clamp01(fD / 10f),
                airSpeed = Mathf.Lerp(0.9f, 1.25f, gS / 10f),
                airTime = Mathf.Lerp(0.6f, 0.3f, gT / 10f),
                airControl = Mathf.Lerp(30f, 75f, gC / 10f),
            };
        }
    }
}
