// TouchDriveInput.cs
// スマホ横画面向けの入力制御（Unity Input System / EnhancedTouch）。
//
// 【どこでもステアリング】
//   ステアリング領域（左側エリア、または全画面）のどこを触っても、触れた瞬間の位置を
//   仮想センターにする。そこから右へずらせば右旋回、左へずらせば左旋回（アナログ）。
// 【ドリフト】
//   右下のドリフトボタンを長押し。ステアリングで旋回中に押し続けている間だけドリフトになり、
//   KartDriftController 側でミニターボのチャージ（火花 青→黄→紫）が進む。離すと発動。
//
// ボタンは uGUI の Button ではなく、画面比率の矩形（ControlLayout）で判定する。
// 設定画面のレイアウトカスタマイズは ControlLayout を書き換えて Save() するだけでよい。
// HUD上のボタン画像は見た目専用にし、Raycast Target は外しておくこと。

using System;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.InputSystem.EnhancedTouch;
using Touch = UnityEngine.InputSystem.EnhancedTouch.Touch;
using TouchPhase = UnityEngine.InputSystem.TouchPhase;

namespace RaceMaster
{
    /// <summary>タッチボタンの配置。座標は画面左下を(0,0)、右上を(1,1)とする比率。</summary>
    [Serializable]
    public class ControlLayout
    {
        public bool steerFullScreen = false;                            // true = 全画面でステアリング
        public float steerAreaWidth = 0.5f;                             // 左から何割をステアリング領域にするか
        public Rect drift = new Rect(0.80f, 0.04f, 0.17f, 0.30f);       // 右下
        public Rect brake = new Rect(0.62f, 0.04f, 0.15f, 0.24f);
        public Rect item = new Rect(0.84f, 0.40f, 0.13f, 0.22f);
        public Rect accel = new Rect(0.62f, 0.32f, 0.15f, 0.24f);       // autoAccel = false のときのみ使用
        public bool autoAccel = true;                                   // 既定：アクセルは自動

        private const string PrefKey = "rm_control_layout";

        public static ControlLayout Load()
        {
            string json = PlayerPrefs.GetString(PrefKey, "");
            return string.IsNullOrEmpty(json) ? new ControlLayout() : JsonUtility.FromJson<ControlLayout>(json);
        }

        public void Save()
        {
            PlayerPrefs.SetString(PrefKey, JsonUtility.ToJson(this));
            PlayerPrefs.Save();
        }
    }

    public class TouchDriveInput : MonoBehaviour
    {
        [SerializeField] private KartDriftController kart;

        [Header("ステアリング")]
        [Tooltip("センターからこの距離（cm）ずらすと最大舵角")]
        [SerializeField] private float steerRangeCm = 1.2f;
        [Tooltip("センター付近の遊び（0〜1）")]
        [SerializeField] private float deadZone = 0.08f;
        [Tooltip("最大距離を超えて引っ張ったとき、センターを指に追従させる")]
        [SerializeField] private bool centerFollowsFinger = true;

        public ControlLayout Layout { get; private set; }

        // ---- HUD表示用（仮想パッドの描画など）----
        public bool SteerActive => steerTouchId != NoTouch;
        public Vector2 SteerCenter { get; private set; }   // 仮想センター（スクリーン座標）
        public Vector2 SteerCurrent { get; private set; }  // 現在の指位置
        public float Steer { get; private set; }           // -1〜+1
        public bool DriftButtonHeld { get; private set; }

        /// <summary>アイテムボタンが押された瞬間。</summary>
        public event Action OnItemPressed;

        private const int NoTouch = -1;
        private int steerTouchId = NoTouch;
        private int driftTouchId = NoTouch;
        private int brakeTouchId = NoTouch;
        private int accelTouchId = NoTouch;
        private float steerRangePx;

        private void Awake()
        {
            Layout = ControlLayout.Load();
            // 端末のDPIから「1.2cm」を画面ピクセルに換算（取得できない端末は画面幅の8%）
            float dpi = Screen.dpi;
            steerRangePx = dpi > 0f ? steerRangeCm / 2.54f * dpi : Screen.width * 0.08f;
        }

        private void OnEnable() => EnhancedTouchSupport.Enable();

        private void OnDisable()
        {
            ReleaseAll();
            EnhancedTouchSupport.Disable();
        }

        /// <summary>設定画面でレイアウトを変更・保存したあとに呼ぶ。</summary>
        public void ReloadLayout() => Layout = ControlLayout.Load();

        private void Update()
        {
            foreach (Touch touch in Touch.activeTouches)
            {
                switch (touch.phase)
                {
                    case TouchPhase.Began:
                        OnTouchBegan(touch.touchId, touch.screenPosition);
                        break;
                    case TouchPhase.Moved:
                    case TouchPhase.Stationary:
                        if (touch.touchId == steerTouchId) UpdateSteer(touch.screenPosition);
                        break;
                    case TouchPhase.Ended:
                    case TouchPhase.Canceled:
                        OnTouchEnded(touch.touchId);
                        break;
                }
            }

            bool accel = Layout.autoAccel || accelTouchId != NoTouch;
            bool brake = brakeTouchId != NoTouch;
            float steer = Steer;
            bool drift = DriftButtonHeld;

            ReadKeyboard(ref steer, ref accel, ref brake, ref drift); // エディタ・PC用

            if (kart == null) return;
            kart.SteerInput = steer;
            kart.AccelHeld = accel && !brake;
            kart.BrakeHeld = brake;
            // ドリフトボタンは「押している」ことだけを渡す。
            // 旋回中（|steer| > 0.2）かどうかの判定と、チャージ・ミニターボ発動は KartDriftController が行う。
            // 先にボタンを押してから曲がり始めても、曲がった瞬間にドリフトへ入る。
            kart.DriftHeld = drift;
        }

        private void OnTouchBegan(int id, Vector2 pos)
        {
            Vector2 n = new Vector2(pos.x / Screen.width, pos.y / Screen.height);

            // ボタンを優先して判定（全画面ステアリング時もボタンは有効）
            if (driftTouchId == NoTouch && Layout.drift.Contains(n)) { driftTouchId = id; DriftButtonHeld = true; return; }
            if (brakeTouchId == NoTouch && Layout.brake.Contains(n)) { brakeTouchId = id; return; }
            if (Layout.item.Contains(n)) { OnItemPressed?.Invoke(); return; }
            if (!Layout.autoAccel && accelTouchId == NoTouch && Layout.accel.Contains(n)) { accelTouchId = id; return; }

            // ステアリング：触れた瞬間の位置がセンターになる
            bool inSteerArea = Layout.steerFullScreen || n.x <= Layout.steerAreaWidth;
            if (steerTouchId == NoTouch && inSteerArea)
            {
                steerTouchId = id;
                SteerCenter = pos;
                SteerCurrent = pos;
                Steer = 0f;
            }
        }

        private void UpdateSteer(Vector2 pos)
        {
            SteerCurrent = pos;
            float dx = pos.x - SteerCenter.x;

            // 最大距離より外へ引っ張ったらセンターを引き寄せ、切り返しがすぐ効くようにする
            if (centerFollowsFinger && Mathf.Abs(dx) > steerRangePx)
            {
                SteerCenter = new Vector2(pos.x - Mathf.Sign(dx) * steerRangePx, SteerCenter.y);
                dx = pos.x - SteerCenter.x;
            }

            float raw = Mathf.Clamp(dx / steerRangePx, -1f, 1f);
            float magnitude = Mathf.Abs(raw);
            Steer = magnitude <= deadZone
                ? 0f
                : Mathf.Sign(raw) * (magnitude - deadZone) / (1f - deadZone); // 遊びの外側を 0〜1 に引き直す
        }

        private void OnTouchEnded(int id)
        {
            if (id == steerTouchId) { steerTouchId = NoTouch; Steer = 0f; }
            if (id == driftTouchId) { driftTouchId = NoTouch; DriftButtonHeld = false; } // 離した瞬間にミニターボ
            if (id == brakeTouchId) brakeTouchId = NoTouch;
            if (id == accelTouchId) accelTouchId = NoTouch;
        }

        private void ReleaseAll()
        {
            steerTouchId = driftTouchId = brakeTouchId = accelTouchId = NoTouch;
            Steer = 0f;
            DriftButtonHeld = false;
            if (kart == null) return;
            kart.SteerInput = 0f;
            kart.AccelHeld = kart.BrakeHeld = kart.DriftHeld = false;
        }

        private void OnApplicationFocus(bool focus)
        {
            if (!focus) ReleaseAll(); // アプリ切替で指が離れた通知が来ない場合の押しっぱなし防止
        }

        /// <summary>キーボード：←→ / A D = ステア、↑ / W = アクセル、↓ / S = ブレーキ、Space = ドリフト、E = アイテム</summary>
        private void ReadKeyboard(ref float steer, ref bool accel, ref bool brake, ref bool drift)
        {
            Keyboard kb = Keyboard.current;
            if (kb == null) return;
            if (kb.leftArrowKey.isPressed || kb.aKey.isPressed) steer = -1f;
            if (kb.rightArrowKey.isPressed || kb.dKey.isPressed) steer = 1f;
            if (kb.upArrowKey.isPressed || kb.wKey.isPressed) accel = true;
            if (kb.downArrowKey.isPressed || kb.sKey.isPressed) brake = true;
            if (kb.spaceKey.isPressed) drift = true;
            if (kb.eKey.wasPressedThisFrame) OnItemPressed?.Invoke();
        }
    }
}
