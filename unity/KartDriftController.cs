// KartDriftController.cs
// 走行・ドリフト・ミニターボ。ステータスは KartStats（4パーツの組み合わせ）から取得する。
//   - ドリフトボタン長押し：グリップを保ったまま鋭く曲がる
//   - 継続時間＋横Gでチャージが溜まり、青 → 黄 → 紫 の3段階に変化
//   - ボタンを離した瞬間、段階に応じた長さのミニターボが発動
// 入力はタッチUI（またはAI）が SteerInput などのプロパティへ書き込む。

using System;
using UnityEngine;

namespace RaceMaster
{
    public enum DriftTier { None = 0, Blue = 1, Yellow = 2, Purple = 3 }

    [RequireComponent(typeof(Rigidbody))]
    public class KartDriftController : MonoBehaviour
    {
        [Header("マシン構成")]
        [SerializeField] private KartLoadout loadout = new KartLoadout();

        [Header("ドリフト")]
        [SerializeField] private float minDriftSpeed = 8f;          // これ未満では開始できない (m/s)
        [SerializeField] private float driftTurnBonus = 1.25f;      // ドリフト中の旋回倍率
        [SerializeField] private float maxSlipAngle = 22f;          // driftGrip=0 のときの外への流れ角 (deg)
        [SerializeField] private float chargePerSecond = 1f;        // 継続時間によるチャージ
        [SerializeField] private float chargePerG = 0.6f;           // 横G 1.0 あたりの追加チャージ/秒
        [SerializeField] private float[] tierThresholds = { 1.0f, 2.4f, 4.0f };   // 青 / 黄 / 紫
        [SerializeField] private float[] tierBoostSeconds = { 0.6f, 1.2f, 2.0f }; // 基本ミニターボ時間

        [Header("ブースト")]
        [SerializeField] private float boostSpeedMultiplier = 1.3f;
        [SerializeField] private float boostAccelMultiplier = 3f;

        [Header("路面")]
        [SerializeField] private LayerMask roadMask = ~0;
        [SerializeField] private LayerMask offroadMask;
        [SerializeField] private float offroadSpeedFactor = 0.45f;  // offroad=0 のマシンの悪路速度
        [SerializeField] private float groundRayLength = 0.9f;

        // ---- 入力（毎フレーム外部から設定）----
        public float SteerInput { get; set; }   // -1（左）〜 +1（右）
        public bool AccelHeld { get; set; }
        public bool BrakeHeld { get; set; }
        public bool DriftHeld { get; set; }

        // ---- 状態（HUD・エフェクト用）----
        public KartStats Stats { get; private set; }
        public bool IsDrifting { get; private set; }
        public DriftTier Tier { get; private set; }
        public float DriftCharge { get; private set; }
        public bool IsBoosting => boostTimer > 0f;
        public bool IsGrounded { get; private set; }
        public float Speed => speed;

        /// <summary>タイヤエフェクトの色を切り替える（None でエフェクト停止）。</summary>
        public event Action<DriftTier> OnDriftTierChanged;
        /// <summary>ミニターボ発動。引数は段階と実際の持続秒数。</summary>
        public event Action<DriftTier, float> OnMiniTurbo;

        private Rigidbody rb;
        private float speed;            // 進行方向の速さ (m/s、負はバック)
        private int driftDir;           // -1 左 / +1 右
        private float yawRate;          // 現在の旋回速度 (deg/s)
        private float boostTimer;
        private float nitroTimer;       // ニトロ中は悪路減速なし
        private float steerInvertTimer; // ホーミング・ボルト
        private float slowTimer, slowFactor = 1f; // 重力トラップ
        private float airTime;
        private bool frozen;            // 救助ドローン演出中
        private bool onOffroad;
        private Vector3 groundNormal = Vector3.up;

        private void Awake()
        {
            rb = GetComponent<Rigidbody>();
            rb.interpolation = RigidbodyInterpolation.Interpolate;
            rb.constraints = RigidbodyConstraints.FreezeRotationX | RigidbodyConstraints.FreezeRotationZ;
            ApplyLoadout(loadout);
        }

        /// <summary>ガレージでパーツを変えたときに呼ぶ。</summary>
        public void ApplyLoadout(KartLoadout newLoadout)
        {
            loadout = newLoadout;
            Stats = KartStatsCalculator.Compute(loadout);
            if (rb != null) rb.mass = Stats.mass;
        }

        private void FixedUpdate()
        {
            float dt = Time.fixedDeltaTime;
            TickTimers(dt);
            if (frozen) return;

            UpdateGround(dt);
            float steer = Mathf.Clamp(SteerInput, -1f, 1f) * (steerInvertTimer > 0f ? -1f : 1f);

            UpdateDrift(steer, dt);
            UpdateSpeed(dt);
            UpdateSteering(steer, dt);
            ApplyMovement();
        }

        // ------------------------------------------------------------------
        // ドリフト＆ミニターボ
        // ------------------------------------------------------------------

        private void UpdateDrift(float steer, float dt)
        {
            if (!IsDrifting)
            {
                bool canStart = DriftHeld && IsGrounded && speed >= minDriftSpeed && Mathf.Abs(steer) > 0.2f;
                if (canStart)
                {
                    IsDrifting = true;
                    driftDir = steer > 0f ? 1 : -1;
                    DriftCharge = 0f;
                    SetTier(DriftTier.None);
                }
                return;
            }

            // 失速・長い滞空ではミニターボなしで解除
            if (speed < minDriftSpeed * 0.6f || airTime > 0.4f) { EndDrift(false); return; }

            // ボタンを離した瞬間に発動
            if (!DriftHeld) { EndDrift(true); return; }

            // チャージ：継続時間 ＋ 横G（= 速度 × 旋回角速度 / g）
            float lateralG = Mathf.Abs(speed * yawRate * Mathf.Deg2Rad) / 9.81f;
            DriftCharge += (chargePerSecond + lateralG * chargePerG) * dt;

            DriftTier tier = DriftTier.None;
            for (int i = 0; i < tierThresholds.Length; i++)
                if (DriftCharge >= tierThresholds[i]) tier = (DriftTier)(i + 1);
            SetTier(tier);
        }

        private void EndDrift(bool fireMiniTurbo)
        {
            DriftTier tier = Tier;
            IsDrifting = false;
            DriftCharge = 0f;
            SetTier(DriftTier.None);

            if (fireMiniTurbo && tier != DriftTier.None)
            {
                float seconds = tierBoostSeconds[(int)tier - 1] * Stats.miniTurboDuration;
                boostTimer = Mathf.Max(boostTimer, seconds);
                OnMiniTurbo?.Invoke(tier, seconds);
            }
        }

        private void SetTier(DriftTier tier)
        {
            if (Tier == tier) return;
            Tier = tier;
            OnDriftTierChanged?.Invoke(tier);
        }

        // ------------------------------------------------------------------
        // 速度・旋回
        // ------------------------------------------------------------------

        private void UpdateSpeed(float dt)
        {
            // 悪路：ニトロ中は減速なし。それ以外はホイールの悪路耐性で軽減
            float surface = 1f;
            if (onOffroad && nitroTimer <= 0f) surface = Mathf.Lerp(offroadSpeedFactor, 1f, Stats.offroad);

            float maxSpeed = Stats.topSpeed * surface * slowFactor;
            float accel = Stats.acceleration;
            if (IsBoosting) { maxSpeed *= boostSpeedMultiplier; accel *= boostAccelMultiplier; }

            if (IsBoosting)
                speed = Mathf.MoveTowards(speed, maxSpeed, accel * dt);            // ブースト中は自動で前進
            else if (BrakeHeld)
                speed = Mathf.MoveTowards(speed, -maxSpeed * 0.35f, accel * 1.8f * dt); // 減速 → バック
            else if (AccelHeld && IsGrounded)
                speed = Mathf.MoveTowards(speed, maxSpeed, accel * dt);
            else
                speed = Mathf.MoveTowards(speed, 0f, accel * 0.5f * dt);           // 惰性

            // 上限超過（ブースト切れ・悪路進入）は緩やかに落とす
            if (speed > maxSpeed) speed = Mathf.MoveTowards(speed, maxSpeed, Stats.acceleration * 1.5f * dt);
        }

        private void UpdateSteering(float steer, float dt)
        {
            float speedRatio = Mathf.Clamp01(Mathf.Abs(speed) / 6f); // 停止中はその場で回らない
            float target;

            if (IsDrifting)
            {
                // ドリフト方向へ常に曲がり続け、ステアで内（鋭く）/外（緩く）を調整する
                float bias = 0.65f + 0.45f * (steer * driftDir); // 0.2（外）〜 1.1（内）
                target = driftDir * Stats.handling * driftTurnBonus * bias;
            }
            else if (IsGrounded)
            {
                target = steer * Stats.handling * speedRatio * Mathf.Sign(speed == 0f ? 1f : speed);
            }
            else
            {
                target = steer * Stats.airControl; // 空中はウィングの制御力
            }

            yawRate = Mathf.MoveTowards(yawRate, target, 600f * dt);
            rb.MoveRotation(rb.rotation * Quaternion.Euler(0f, yawRate * dt, 0f));
        }

        private void ApplyMovement()
        {
            Vector3 forward = transform.forward;

            // ドリフト中は進行方向が外側へ流れる。ホイールの driftGrip が高いほど流れない
            if (IsDrifting)
            {
                float slip = maxSlipAngle * (1f - Stats.driftGrip);
                forward = Quaternion.AngleAxis(-driftDir * slip, transform.up) * forward;
            }

            Vector3 current = GetVelocity();
            if (IsGrounded)
            {
                Vector3 along = Vector3.ProjectOnPlane(forward, groundNormal).normalized * speed;
                SetVelocity(along + Vector3.down * 2f); // 路面へ軽く押し付けて段差で浮かないようにする
            }
            else
            {
                Vector3 flat = Vector3.ProjectOnPlane(forward, Vector3.up).normalized * speed;
                SetVelocity(new Vector3(flat.x, current.y, flat.z)); // 縦は重力に任せる
            }
        }

        private void UpdateGround(float dt)
        {
            Vector3 origin = transform.position + Vector3.up * 0.4f;
            if (Physics.Raycast(origin, Vector3.down, out RaycastHit hit, groundRayLength, roadMask | offroadMask,
                    QueryTriggerInteraction.Ignore))
            {
                IsGrounded = true;
                groundNormal = hit.normal;
                onOffroad = (offroadMask.value & (1 << hit.collider.gameObject.layer)) != 0;
                airTime = 0f;
            }
            else
            {
                IsGrounded = false;
                onOffroad = false;
                groundNormal = Vector3.up;
                airTime += dt;
            }
        }

        private void TickTimers(float dt)
        {
            if (boostTimer > 0f) boostTimer -= dt;
            if (nitroTimer > 0f) nitroTimer -= dt;
            if (steerInvertTimer > 0f) steerInvertTimer -= dt;
            if (slowTimer > 0f) { slowTimer -= dt; if (slowTimer <= 0f) slowFactor = 1f; }
        }

        // ------------------------------------------------------------------
        // アイテム・ギミックからの外部フック
        // ------------------------------------------------------------------

        /// <summary>ニトロ・カプセル：指定秒数の猛加速。悪路でも減速しない。</summary>
        public void ApplyNitro(float seconds = 3f)
        {
            boostTimer = Mathf.Max(boostTimer, seconds);
            nitroTimer = Mathf.Max(nitroTimer, seconds);
        }

        /// <summary>プラズマ・オーブ被弾：ダッシュ（ドリフトチャージ・ブースト）をリセットし減速。</summary>
        public void ResetDashAndSlow(float speedFactor = 0.6f, float seconds = 1.5f)
        {
            if (IsDrifting) EndDrift(false);
            boostTimer = 0f;
            nitroTimer = 0f;
            ApplySlow(speedFactor, seconds);
        }

        /// <summary>ホーミング・ボルト被弾：左右のハンドル操作を反転。</summary>
        public void InvertSteering(float seconds = 1.5f) => steerInvertTimer = Mathf.Max(steerInvertTimer, seconds);

        /// <summary>重力トラップなど：最高速度を一定時間 factor 倍にする。耐久性が高いほど軽減。</summary>
        public void ApplySlow(float factor, float seconds)
        {
            slowFactor = Mathf.Lerp(factor, 1f, Stats.durability * 0.3f);
            slowTimer = seconds * (1f - Stats.durability * 0.3f);
        }

        /// <summary>落下時の救助ドローン演出用。true で完全停止、false で再スタート。</summary>
        public void SetFrozen(bool value)
        {
            frozen = value;
            rb.isKinematic = value;
            if (value)
            {
                if (IsDrifting) EndDrift(false);
                speed = 0f;
                yawRate = 0f;
                boostTimer = 0f;
                nitroTimer = 0f;
            }
        }

        // Unity 6 で Rigidbody.velocity が linearVelocity に改名されたため吸収する
        private Vector3 GetVelocity()
        {
#if UNITY_6000_0_OR_NEWER
            return rb.linearVelocity;
#else
            return rb.velocity;
#endif
        }

        private void SetVelocity(Vector3 v)
        {
#if UNITY_6000_0_OR_NEWER
            rb.linearVelocity = v;
#else
            rb.velocity = v;
#endif
        }
    }
}
