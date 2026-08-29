using System.Runtime.InteropServices;
using System.Text.Json.Nodes;

namespace NexaShareControl.Native;

internal static class NativeInput
{
    [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X; public int Y; }
    [StructLayout(LayoutKind.Sequential)] struct INPUT { public uint type; public U U; }
    [StructLayout(LayoutKind.Explicit)] struct U { [FieldOffset(0)] public MOUSEINPUT mi; [FieldOffset(0)] public KEYBDINPUT ki; }
    [StructLayout(LayoutKind.Sequential)] struct MOUSEINPUT { public int dx,dy; public uint mouseData,dwFlags,time; public IntPtr dwExtraInfo; }
    [StructLayout(LayoutKind.Sequential)] struct KEYBDINPUT { public ushort wVk,wScan; public uint dwFlags,time; public IntPtr dwExtraInfo; }

    const uint IM=0,IK=1,LD=2,LU=4,RD=8,RU=16,MD=32,MU=64,WHEEL=0x800,KUP=2,KUNI=4;
    [DllImport("user32.dll")] static extern bool SetCursorPos(int X,int Y);
    [DllImport("user32.dll")] static extern bool GetCursorPos(out POINT p);
    [DllImport("user32.dll")] static extern uint SendInput(uint n,INPUT[] p,int cb);

    public static POINT GetCursor(){GetCursorPos(out var p);return p;}

    public static void Move(JsonObject q)
    {
        bool pix=q["pixels"]?.GetValue<bool>()??false;
        double x=q["x"]?.GetValue<double>()??0,y=q["y"]?.GetValue<double>()??0;
        if(pix){SetCursorPos((int)Math.Round(x),(int)Math.Round(y));return;}
        var m=MonitorInfo.Resolve(q["monitor_id"]?.GetValue<string>());
        SetCursorPos(m.X+(int)Math.Round(Math.Clamp(x,0,1)*Math.Max(1,m.Width-1)),
                     m.Y+(int)Math.Round(Math.Clamp(y,0,1)*Math.Max(1,m.Height-1)));
    }

    static (uint,uint) F(string b)=>b.ToLowerInvariant() switch{"right"=>(RD,RU),"middle"=>(MD,MU),_=>(LD,LU)};
    static void Mouse(uint f,uint d){var i=new INPUT{type=IM,U=new U{mi=new MOUSEINPUT{dwFlags=f,mouseData=d}}};SendInput(1,[i],Marshal.SizeOf<INPUT>());}
    public static void Button(string b,bool down){var f=F(b);Mouse(down?f.Item1:f.Item2,0);}
    public static void Click(string b,int count){var f=F(b);for(int i=0;i<count;i++){Mouse(f.Item1,0);Mouse(f.Item2,0);if(count>1)Thread.Sleep(80);}}
    public static void Wheel(int d)=>Mouse(WHEEL,unchecked((uint)d));

    public static void Drag(JsonObject q)
    {
        var m=MonitorInfo.Resolve(q["monitor_id"]?.GetValue<string>());
        double x1=q["x1"]?.GetValue<double>()??0,y1=q["y1"]?.GetValue<double>()??0,
               x2=q["x2"]?.GetValue<double>()??0,y2=q["y2"]?.GetValue<double>()??0;
        int dur=Math.Clamp(q["duration_ms"]?.GetValue<int>()??500,50,5000);
        string b=q["button"]?.GetValue<string>()??"left";
        int sx=m.X+(int)(Math.Clamp(x1,0,1)*(m.Width-1)),sy=m.Y+(int)(Math.Clamp(y1,0,1)*(m.Height-1)),
            ex=m.X+(int)(Math.Clamp(x2,0,1)*(m.Width-1)),ey=m.Y+(int)(Math.Clamp(y2,0,1)*(m.Height-1));
        SetCursorPos(sx,sy);Button(b,true);
        int steps=Math.Clamp(dur/12,5,240);
        for(int i=1;i<=steps;i++){double t=(double)i/steps;SetCursorPos((int)Math.Round(sx+(ex-sx)*t),(int)Math.Round(sy+(ey-sy)*t));Thread.Sleep(Math.Max(1,dur/steps));}
        Button(b,false);
    }

    public static void TypeText(string t)
    {
        foreach(var ch in t)
        {
            ushort c=ch;
            var d=new INPUT{type=IK,U=new U{ki=new KEYBDINPUT{wScan=c,dwFlags=KUNI}}},
                u=new INPUT{type=IK,U=new U{ki=new KEYBDINPUT{wScan=c,dwFlags=KUNI|KUP}}};
            SendInput(2,[d,u],Marshal.SizeOf<INPUT>());
        }
    }

    static readonly Dictionary<string,ushort> K=new(StringComparer.OrdinalIgnoreCase){
        {"ENTER",13},{"ESCAPE",27},{"ESC",27},{"TAB",9},{"SPACE",32},{"BACKSPACE",8},{"DELETE",46},{"INSERT",45},
        {"HOME",36},{"END",35},{"PAGEUP",33},{"PAGEDOWN",34},{"ARROWUP",38},{"ARROWDOWN",40},{"ARROWLEFT",37},
        {"ARROWRIGHT",39},{"SHIFT",16},{"CTRL",17},{"CONTROL",17},{"ALT",18},{"WINDOWS",91},{"WIN",91}
    };

    static ushort Vk(string k)
    {
        if(K.TryGetValue(k,out var v))return v;
        if(k.Length==1){char c=char.ToUpperInvariant(k[0]);if(char.IsLetterOrDigit(c))return c;}
        if(k.StartsWith("F",StringComparison.OrdinalIgnoreCase)&&int.TryParse(k[1..],out int f)&&f>=1&&f<=12)return(ushort)(0x70+f-1);
        throw new ArgumentException($"unsupported_key:{k}");
    }

    public static void Key(string k,bool down){var i=new INPUT{type=IK,U=new U{ki=new KEYBDINPUT{wVk=Vk(k),dwFlags=down?0:KUP}}};SendInput(1,[i],Marshal.SizeOf<INPUT>());}
    public static void KeyTap(string k){Key(k,true);Key(k,false);}
    public static void Combo(string[] ks){foreach(var k in ks)Key(k,true);for(int i=ks.Length-1;i>=0;i--)Key(ks[i],false);}
}
