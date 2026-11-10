// PaintBlit.shader
// KartPaintEditor が RenderTexture へブラシ・ステッカー・レイヤーを描き込むための合成用シェーダー。
// レイヤーは「乗算済みアルファ」で保持する。
//   Pass 0: 通常の重ね描き   Pass 1: 消しゴム（アルファを削る）
// ※ ビルドに含めるため、KartPaintEditor の paintShader 欄に必ず割り当てること。
Shader "RaceMaster/PaintBlit"
{
    Properties
    {
        _MainTex ("Texture", 2D) = "white" {}
        _Color ("Tint", Color) = (1, 1, 1, 1)
        _SrcPremultiplied ("Source is premultiplied", Float) = 0
    }
    SubShader
    {
        Cull Off ZWrite Off ZTest Always

        CGINCLUDE
        #include "UnityCG.cginc"

        sampler2D _MainTex;
        fixed4 _Color;
        float _SrcPremultiplied;

        struct appdata { float4 vertex : POSITION; float2 uv : TEXCOORD0; };
        struct v2f { float4 pos : SV_POSITION; float2 uv : TEXCOORD0; };

        v2f vert(appdata v)
        {
            v2f o;
            o.pos = UnityObjectToClipPos(v.vertex);
            o.uv = v.uv;
            return o;
        }

        // 乗算済みアルファの色を返す
        fixed4 frag(v2f i) : SV_Target
        {
            fixed4 c = tex2D(_MainTex, i.uv);
            if (_SrcPremultiplied < 0.5) c.rgb *= c.a;
            c.rgb *= _Color.rgb * _Color.a;
            c.a *= _Color.a;
            return c;
        }
        ENDCG

        Pass
        {
            Blend One OneMinusSrcAlpha
            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            ENDCG
        }

        Pass
        {
            Blend Zero OneMinusSrcAlpha
            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            ENDCG
        }
    }
}
