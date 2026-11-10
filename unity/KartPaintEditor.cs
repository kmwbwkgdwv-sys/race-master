// KartPaintEditor.cs
// 車体ペイントエディタ：お絵描き（ブラシ / 消しゴム）と、画像（PNG/JPG）ステッカーの貼り付け。
//
// 方式：車体メッシュのUV空間に対するテクスチャブレンド
//   ペイント層（RenderTexture、透明） ＋ ステッカー（位置・サイズ・回転つき）
//     → 元の車体テクスチャの上に合成 → 車体マテリアルの _BaseMap に割り当て
//   画面タッチ位置 → Raycast → hit.textureCoord（UV）で描画位置を決める。
//
// 前提：
//   - 車体は MeshCollider 付き（メッシュは Read/Write 有効）で、UVが重ならない展開になっていること
//   - paintShader に RaceMaster/PaintBlit を割り当てること
//   - 端末のフォルダから画像を選ぶUIはOSごとのピッカー（NativeGallery 等のプラグイン、
//     WebGLなら <input type="file">）が必要。選ばれたファイルのパス or バイト列をここへ渡す
//
// 操作：1本指 = 描く / ステッカー移動、2本指 = ピンチで拡大縮小・ドラッグで回転
//       PC：左ドラッグ = 描く、右ドラッグ = 回転、ホイール = 拡大縮小

using System;
using System.Collections.Generic;
using System.IO;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.InputSystem.EnhancedTouch;
using Touch = UnityEngine.InputSystem.EnhancedTouch.Touch;

namespace RaceMaster
{
    public enum PaintTool { Brush, Eraser, Sticker }

    public class PaintSticker
    {
        public Texture2D texture;
        public Vector2 uv = new Vector2(0.5f, 0.5f); // 配置位置（中心）
        public float size = 0.2f;                    // 幅（UV単位）
        public float rotation;                       // 度
    }

    public class KartPaintEditor : MonoBehaviour
    {
        [Header("参照")]
        [SerializeField] private Camera editCamera;
        [SerializeField] private Transform kartPivot;        // 回転させるマシンの親
        [SerializeField] private MeshCollider bodyCollider;  // 車体（塗る対象）
        [SerializeField] private Renderer bodyRenderer;
        [SerializeField] private Texture baseAlbedo;         // 元の車体テクスチャ（null なら白）
        [SerializeField] private Shader paintShader;         // RaceMaster/PaintBlit
        [SerializeField] private RectTransform paintArea;    // この範囲内のタッチだけ受け付ける（null = 全画面）

        [Header("設定")]
        [SerializeField] private int textureSize = 1024;
        [SerializeField] private int maxStickerPixels = 1024; // 読み込み画像の長辺上限
        [SerializeField] private int maxStickers = 16;
        [SerializeField] private int maxUndo = 8;
        [SerializeField] private float minFov = 12f, maxFov = 60f;
        [SerializeField] private float rotateSpeed = 0.25f;   // 度 / px

        // ---- パレット（UIから設定）----
        public PaintTool Tool { get; set; } = PaintTool.Brush;
        public Color BrushColor { get; set; } = Color.red;
        /// <summary>ブラシ直径（UV単位、0.005〜0.3）。</summary>
        public float BrushSize { get => brushSize; set => brushSize = Mathf.Clamp(value, 0.005f, 0.3f); }

        public IReadOnlyList<PaintSticker> Stickers => stickers;
        public PaintSticker SelectedSticker { get; private set; }
        public event Action OnChanged;

        private readonly List<PaintSticker> stickers = new List<PaintSticker>();
        private readonly List<RenderTexture> undoStack = new List<RenderTexture>();
        private RenderTexture paintLayer;   // ペイント層（乗算済みアルファ）
        private RenderTexture composite;    // 車体に表示する最終結果
        private Material blitMaterial;
        private Texture2D brushTexture;
        private float brushSize = 0.03f;

        private bool stroking;
        private bool pointerDown;
        private Vector2 lastUv;
        private float lastPinchDistance;
        private Vector2 lastTwoFingerCenter;

        private static readonly int MainTexId = Shader.PropertyToID("_MainTex");
        private static readonly int ColorId = Shader.PropertyToID("_Color");
        private static readonly int PremulId = Shader.PropertyToID("_SrcPremultiplied");

        // ------------------------------------------------------------------
        // 初期化
        // ------------------------------------------------------------------

        private void Awake()
        {
            blitMaterial = new Material(paintShader);
            brushTexture = CreateSoftCircle(64);

            paintLayer = NewLayer(false);
            composite = NewLayer(true);
            Clear(paintLayer, Color.clear);

            // 車体マテリアルへ割り当て（URP Lit は _BaseMap、旧シェーダーは _MainTex）
            Material m = bodyRenderer.material;
            if (m.HasProperty("_BaseMap")) m.SetTexture("_BaseMap", composite);
            if (m.HasProperty("_MainTex")) m.SetTexture("_MainTex", composite);
            Recompose();
        }

        private void OnEnable() => EnhancedTouchSupport.Enable();
        private void OnDisable() => EnhancedTouchSupport.Disable();

        private void OnDestroy()
        {
            if (paintLayer) paintLayer.Release();
            if (composite) composite.Release();
            foreach (var rt in undoStack) RenderTexture.ReleaseTemporary(rt);
        }

        private RenderTexture NewLayer(bool mips)
        {
            var rt = new RenderTexture(textureSize, textureSize, 0, RenderTextureFormat.ARGB32)
            {
                useMipMap = mips, autoGenerateMips = mips,
                wrapMode = TextureWrapMode.Clamp, filterMode = FilterMode.Bilinear,
            };
            rt.Create();
            return rt;
        }

        // ------------------------------------------------------------------
        // 画像アップロード（ステッカー）
        // ------------------------------------------------------------------

        /// <summary>端末のファイルパスから PNG/JPG を読み込んで貼り付ける。</summary>
        public PaintSticker AddStickerFromFile(string path)
        {
            return File.Exists(path) ? AddStickerFromBytes(File.ReadAllBytes(path)) : null;
        }

        /// <summary>PNG/JPG のバイト列から貼り付ける（WebGL のファイル選択などで使用）。</summary>
        public PaintSticker AddStickerFromBytes(byte[] imageBytes)
        {
            if (imageBytes == null || stickers.Count >= maxStickers) return null;

            var tex = new Texture2D(2, 2, TextureFormat.RGBA32, false);
            if (!tex.LoadImage(imageBytes)) { Destroy(tex); return null; } // PNG/JPG 以外は失敗する

            tex = Downscale(tex, maxStickerPixels);
            tex.wrapMode = TextureWrapMode.Clamp;

            var sticker = new PaintSticker { texture = tex };
            stickers.Add(sticker);
            SelectedSticker = sticker;
            Tool = PaintTool.Sticker; // 追加直後はそのまま位置調整できるようにする
            Recompose();
            return sticker;
        }

        /// <summary>選択中ステッカーのサイズ（拡大・縮小）。UV単位の幅。</summary>
        public void SetStickerSize(float size)
        {
            if (SelectedSticker == null) return;
            SelectedSticker.size = Mathf.Clamp(size, 0.02f, 1f);
            Recompose();
        }

        public void SetStickerRotation(float degrees)
        {
            if (SelectedSticker == null) return;
            SelectedSticker.rotation = degrees;
            Recompose();
        }

        /// <summary>選択中ステッカーの配置位置をUVで直接指定する。</summary>
        public void SetStickerPosition(Vector2 uv)
        {
            if (SelectedSticker == null) return;
            SelectedSticker.uv = uv;
            Recompose();
        }

        public void SelectSticker(int index)
        {
            SelectedSticker = index >= 0 && index < stickers.Count ? stickers[index] : null;
        }

        public void RemoveSelectedSticker()
        {
            if (SelectedSticker == null) return;
            stickers.Remove(SelectedSticker);
            Destroy(SelectedSticker.texture);
            SelectedSticker = null;
            Recompose();
        }

        // ------------------------------------------------------------------
        // 入力
        // ------------------------------------------------------------------

        private void Update()
        {
            var touches = Touch.activeTouches;
            if (touches.Count >= 2)
            {
                EndStroke();
                HandleTwoFingers(touches[0].screenPosition, touches[1].screenPosition);
                return;
            }
            lastPinchDistance = 0f;

            if (touches.Count == 1)
            {
                var t = touches[0];
                bool began = t.phase == UnityEngine.InputSystem.TouchPhase.Began;
                bool ended = t.phase == UnityEngine.InputSystem.TouchPhase.Ended ||
                             t.phase == UnityEngine.InputSystem.TouchPhase.Canceled;
                HandlePointer(t.screenPosition, began, ended);
                return;
            }

            Mouse mouse = Mouse.current;
            if (mouse == null) { EndStroke(); return; }

            Vector2 pos = mouse.position.ReadValue();
            if (mouse.rightButton.isPressed) RotateView(mouse.delta.ReadValue());
            float scroll = mouse.scroll.ReadValue().y;
            if (Mathf.Abs(scroll) > 0.01f) Zoom(scroll > 0f ? 0.9f : 1.1f);

            if (mouse.leftButton.isPressed || mouse.leftButton.wasReleasedThisFrame)
                HandlePointer(pos, mouse.leftButton.wasPressedThisFrame, mouse.leftButton.wasReleasedThisFrame);
            else EndStroke();
        }

        private void HandlePointer(Vector2 screenPos, bool began, bool ended)
        {
            if (ended) { EndStroke(); return; }
            if (began) pointerDown = InPaintArea(screenPos);
            if (!pointerDown) return;

            if (!TryGetUv(screenPos, out Vector2 uv))
            {
                lastUv = new Vector2(-10f, -10f); // 車体の外に出たら、戻ってきたときに線をつながない
                return;
            }

            if (Tool == PaintTool.Sticker)
            {
                SetStickerPosition(uv); // タップ／ドラッグした場所へ移動
                return;
            }

            if (!stroking)
            {
                PushUndo(); // 1ストロークにつき1回
                stroking = true;
                Stamp(uv);
            }
            else
            {
                // 前回位置から補間して線が途切れないようにする。
                // UVの継ぎ目をまたいだ場合（距離が大きく飛ぶ）は補間しない。
                float dist = Vector2.Distance(lastUv, uv);
                float step = Mathf.Max(brushSize * 0.25f, 0.001f);
                if (dist < 0.15f)
                    for (float d = step; d < dist; d += step) Stamp(Vector2.Lerp(lastUv, uv, d / dist));
                Stamp(uv);
            }
            lastUv = uv;
            Recompose();
        }

        private void EndStroke() { stroking = false; pointerDown = false; }

        private void HandleTwoFingers(Vector2 a, Vector2 b)
        {
            float distance = Vector2.Distance(a, b);
            Vector2 center = (a + b) * 0.5f;
            if (lastPinchDistance > 0f)
            {
                if (distance > 1f) Zoom(lastPinchDistance / distance); // ピンチ：拡大・縮小
                RotateView(center - lastTwoFingerCenter);              // 2本指ドラッグ：回転
            }
            lastPinchDistance = distance;
            lastTwoFingerCenter = center;
        }

        /// <summary>マシンの表示を拡大・縮小する（factor &lt; 1 で拡大）。</summary>
        public void Zoom(float factor)
        {
            editCamera.fieldOfView = Mathf.Clamp(editCamera.fieldOfView * factor, minFov, maxFov);
        }

        /// <summary>マシンを回転させる（画面上のドラッグ量 px）。</summary>
        public void RotateView(Vector2 deltaPixels)
        {
            kartPivot.Rotate(Vector3.up, -deltaPixels.x * rotateSpeed, Space.World);
            kartPivot.Rotate(editCamera.transform.right, deltaPixels.y * rotateSpeed, Space.World);
        }

        private bool InPaintArea(Vector2 screenPos)
        {
            return paintArea == null || RectTransformUtility.RectangleContainsScreenPoint(paintArea, screenPos, null);
        }

        private bool TryGetUv(Vector2 screenPos, out Vector2 uv)
        {
            Ray ray = editCamera.ScreenPointToRay(screenPos);
            if (bodyCollider.Raycast(ray, out RaycastHit hit, 100f))
            {
                uv = hit.textureCoord;
                return true;
            }
            uv = default;
            return false;
        }

        // ------------------------------------------------------------------
        // 描画
        // ------------------------------------------------------------------

        private void Stamp(Vector2 uv)
        {
            bool erase = Tool == PaintTool.Eraser;
            DrawQuad(paintLayer, brushTexture, uv, new Vector2(brushSize, brushSize) * 0.5f, 0f,
                erase ? Color.white : BrushColor, false, erase ? 1 : 0);
        }

        /// <summary>元テクスチャ → ペイント層 → ステッカーの順に重ねて、車体表示用テクスチャを作り直す。</summary>
        private void Recompose()
        {
            if (baseAlbedo != null) Graphics.Blit(baseAlbedo, composite);
            else Clear(composite, Color.white);
            DrawLayers(composite);
            OnChanged?.Invoke();
        }

        private void DrawLayers(RenderTexture target)
        {
            Vector2 half = new Vector2(0.5f, 0.5f);
            DrawQuad(target, paintLayer, half, half, 0f, Color.white, true, 0);
            foreach (PaintSticker s in stickers)
            {
                float aspect = (float)s.texture.height / s.texture.width;
                DrawQuad(target, s.texture, s.uv, new Vector2(s.size, s.size * aspect) * 0.5f, s.rotation,
                    Color.white, false, 0);
            }
        }

        /// <summary>UV空間（0〜1）上に、回転つきの四角形を1枚描く。</summary>
        private void DrawQuad(RenderTexture target, Texture tex, Vector2 center, Vector2 halfSize, float rotationDeg,
            Color color, bool sourcePremultiplied, int pass)
        {
            blitMaterial.SetTexture(MainTexId, tex);
            blitMaterial.SetColor(ColorId, color);
            blitMaterial.SetFloat(PremulId, sourcePremultiplied ? 1f : 0f);

            float rad = rotationDeg * Mathf.Deg2Rad;
            Vector2 right = new Vector2(Mathf.Cos(rad), Mathf.Sin(rad)) * halfSize.x;
            Vector2 up = new Vector2(-Mathf.Sin(rad), Mathf.Cos(rad)) * halfSize.y;

            RenderTexture previous = RenderTexture.active;
            RenderTexture.active = target;
            GL.PushMatrix();
            GL.LoadOrtho();
            blitMaterial.SetPass(pass);
            GL.Begin(GL.QUADS);
            GL.TexCoord2(0f, 0f); GL.Vertex(center - right - up);
            GL.TexCoord2(1f, 0f); GL.Vertex(center + right - up);
            GL.TexCoord2(1f, 1f); GL.Vertex(center + right + up);
            GL.TexCoord2(0f, 1f); GL.Vertex(center - right + up);
            GL.End();
            GL.PopMatrix();
            RenderTexture.active = previous;
        }

        private static void Clear(RenderTexture target, Color color)
        {
            RenderTexture previous = RenderTexture.active;
            RenderTexture.active = target;
            GL.Clear(true, true, color);
            RenderTexture.active = previous;
        }

        // ------------------------------------------------------------------
        // 元に戻す・消去
        // ------------------------------------------------------------------

        private void PushUndo()
        {
            var copy = RenderTexture.GetTemporary(paintLayer.descriptor);
            Graphics.CopyTexture(paintLayer, copy);
            undoStack.Add(copy);
            if (undoStack.Count > maxUndo)
            {
                RenderTexture.ReleaseTemporary(undoStack[0]);
                undoStack.RemoveAt(0);
            }
        }

        /// <summary>直前の1ストロークを取り消す。</summary>
        public void Undo()
        {
            if (undoStack.Count == 0) return;
            RenderTexture last = undoStack[undoStack.Count - 1];
            undoStack.RemoveAt(undoStack.Count - 1);
            Graphics.CopyTexture(last, paintLayer);
            RenderTexture.ReleaseTemporary(last);
            Recompose();
        }

        public void ClearPaint()
        {
            PushUndo();
            Clear(paintLayer, Color.clear);
            Recompose();
        }

        // ------------------------------------------------------------------
        // 保存・読み込み（ペイント＋ステッカーを1枚の透過PNGに焼き込む）
        // ------------------------------------------------------------------

        public static string SkinPath(int slot) => Path.Combine(Application.persistentDataPath, $"skin_{slot}.png");

        public void SaveSkin(int slot)
        {
            var temp = RenderTexture.GetTemporary(paintLayer.descriptor);
            Clear(temp, Color.clear);
            DrawLayers(temp);

            RenderTexture previous = RenderTexture.active;
            RenderTexture.active = temp;
            var tex = new Texture2D(textureSize, textureSize, TextureFormat.RGBA32, false);
            tex.ReadPixels(new Rect(0, 0, textureSize, textureSize), 0, 0);
            RenderTexture.active = previous;
            RenderTexture.ReleaseTemporary(temp);

            // 乗算済みアルファ → 通常のアルファに戻してからPNG化
            Color32[] px = tex.GetPixels32();
            for (int i = 0; i < px.Length; i++)
            {
                byte a = px[i].a;
                if (a == 0 || a == 255) continue;
                px[i].r = (byte)Mathf.Min(255, px[i].r * 255 / a);
                px[i].g = (byte)Mathf.Min(255, px[i].g * 255 / a);
                px[i].b = (byte)Mathf.Min(255, px[i].b * 255 / a);
            }
            tex.SetPixels32(px);
            File.WriteAllBytes(SkinPath(slot), tex.EncodeToPNG());
            Destroy(tex);
        }

        /// <summary>保存済みスキンを読み込む（ステッカーは焼き込み済みなので再編集は不可）。</summary>
        public bool LoadSkin(int slot)
        {
            string path = SkinPath(slot);
            if (!File.Exists(path)) return false;
            var tex = new Texture2D(2, 2, TextureFormat.RGBA32, false);
            if (!tex.LoadImage(File.ReadAllBytes(path))) { Destroy(tex); return false; }

            foreach (PaintSticker s in stickers) Destroy(s.texture);
            stickers.Clear();
            SelectedSticker = null;
            Clear(paintLayer, Color.clear);
            Vector2 half = new Vector2(0.5f, 0.5f);
            DrawQuad(paintLayer, tex, half, half, 0f, Color.white, false, 0);
            Destroy(tex);
            Recompose();
            return true;
        }

        // ------------------------------------------------------------------
        // ユーティリティ
        // ------------------------------------------------------------------

        private static Texture2D CreateSoftCircle(int size)
        {
            var tex = new Texture2D(size, size, TextureFormat.RGBA32, false) { wrapMode = TextureWrapMode.Clamp };
            var px = new Color32[size * size];
            float r = size * 0.5f;
            for (int y = 0; y < size; y++)
            for (int x = 0; x < size; x++)
            {
                float d = Vector2.Distance(new Vector2(x + 0.5f, y + 0.5f), new Vector2(r, r)) / r;
                float a = Mathf.Clamp01((1f - d) / 0.25f); // 外周25%をぼかす
                px[y * size + x] = new Color32(255, 255, 255, (byte)(a * 255f));
            }
            tex.SetPixels32(px);
            tex.Apply();
            return tex;
        }

        /// <summary>長辺が maxPixels を超える画像を縮小する（メモリ節約）。</summary>
        public static Texture2D Downscale(Texture2D source, int maxPixels)
        {
            int longSide = Mathf.Max(source.width, source.height);
            if (longSide <= maxPixels) return source;

            float scale = (float)maxPixels / longSide;
            int w = Mathf.Max(1, Mathf.RoundToInt(source.width * scale));
            int h = Mathf.Max(1, Mathf.RoundToInt(source.height * scale));

            RenderTexture rt = RenderTexture.GetTemporary(w, h, 0, RenderTextureFormat.ARGB32);
            Graphics.Blit(source, rt);
            RenderTexture previous = RenderTexture.active;
            RenderTexture.active = rt;
            var result = new Texture2D(w, h, TextureFormat.RGBA32, false);
            result.ReadPixels(new Rect(0, 0, w, h), 0, 0);
            result.Apply();
            RenderTexture.active = previous;
            RenderTexture.ReleaseTemporary(rt);
            Destroy(source);
            return result;
        }
    }
}
