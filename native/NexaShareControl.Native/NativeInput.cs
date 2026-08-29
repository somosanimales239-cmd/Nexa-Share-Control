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

    static (int X,int Y,int Width,int Height) ResolveTarget(JsonObject q)
    {
        var windowId=q["window_id"]?.GetValue<long>()??0;
        if(windowId!=0)
        {
            var w=WindowControl.Get(windowId);
            if(w is not null&&w.Width>0&&w.Height>0)return(w.X,w.Y,w.Width,w.Height);
        }
        var m=MonitorInfo.Resolve(q["monitor_id"]?.GetValue<string>());
        return(m.X,m.Y,m.Width,m.Height);
    }

    public static void Move(JsonObject q)
    {
        bool pixels=q["pixels"]?.GetValue<bool>()??false;
        double x=q["x"]?.GetValue<double>()??0,y=q["y"]?.GetValue<double>()??0;
        if(pixels){SetCursorPos((int)Math.Round(x),(int)Math.Round(y));return;}
        var t=ResolveTarget(q);
        SetCursorPos(t.X+(int)Math.Round(Math.Clamp(x,0,1)*Math.Max(1,t.Width-1)),
                     t.Y+(int)Math.Round(Math.Clamp(y,0,1)*Math.Max(1,t.Height-1)));
    }

    static (uint,uint) F(string b)=>b.ToLowerInvariant() switch{"right"=>(RD,RU),"middle"=>(MD,MU),_=>(LD,LU)};
    static void Mouse(uint f,uint d){var i=new INPUT{type=IM,U=new U{mi=new MOUSEINPUT{dwFlags=f,mouseData=d}}};SendInput(1,[i],Marshal.SizeOf<INPUT>());}
    public static void Button(string b,bool down){var f=F(b);Mouse(down?f.Item1:f.Item2,0);}
    public static void Click(string b,int count){var f=F(b);for(int i=0;i<count;i++){Mouse(f.Item1,0);Mouse(f.Item2,0);if(count>1)Thread.Sleep(80);}}
    public static void Wheel(int d)=>Mouse(WHEEL,unchecked((uint)d));

    public static void Drag(JsonObject q)
    {
        var t=ResolveTarget(q);
        double x1=q["x1"]?.GetValue<double>()??0,y1=q["y1"]?.GetValue<double>()??0,
               x2=q["x2"]?.GetValue<double>()??0,y2=q["y2"]?.GetValue<double>()??0;
        int dur=Math.Clamp(q["duration_ms"]?.GetValue<int>()??500,50,5000);
        string b=q["button"]?.GetValue<string>()??"left";
        int sx=t.X+(int)(Math.Clamp(x1,0,1)*Math.Max(1,t.Width-1)),sy=t.Y+(int)(Math.Clamp(y1,0,1)*Math.Max(1,t.Height-1)),
            ex=t.X+(int)(Math.Clamp(x2,0,1)*Math.Max(1,t.Width-1)),ey=t.Y+(int)(Math.Clamp(y2,0,1)*Math.Max(1,t.Height-1));
        SetCursorPos(sx,sy);Button(b,true);
        int steps=Math.Clamp(dur/12,5,240);
        for(int i=1;i<=steps;i++){double v=(double)i/steps;SetCursorPos((int)Math.Round(sx+(ex-sx)*v),(int)Math.Round(sy+(ey-sy)*v));Thread.Sleep(Math.Max(1,dur/steps));}
        Button(b,false);
    }

    public static void TypeText(string text)
    {
        foreach(var ch in text)
        {
            ushort c=ch;
            var down=new INPUT{type=IK,U=new U{ki=new KEYBDINPUT{wScan=c,dwFlags=KUNI}}},
                up=new INPUT{type=IK,U=new U{ki=new KEYBDINPUT{wScan=c,dwFlags=KUNI|KUP}}};
            SendInput(2,[down,up],Marshal.SizeOf<INPUT>());
        }
    }

    static readonly Dictionary<string,ushort> K=new(StringComparer.OrdinalIgnoreCase){
        {"ENTER",13},{"ESCAPE",27},{"ESC",27},{"TAB",9},{"SPACE",32},{"BACKSPACE",8},{"DELETE",46},{"INSERT",45},
        {"HOME",36},{"END",35},{"PAGEUP",33},{"PAGEDOWN",34},{"ARROWUP",38},{"ARROWDOWN",40},{"ARROWLEFT",37},
        {"ARROWRIGHT",39},{"SHIFT",16},{"CTRL",17},{"CONTROL",17},{"ALT",18},{"WINDOWS",91},{"WIN",91}
    };

    static ushort Vk(string key)
    {
        if(K.TryGetValue(key,out var value))return value;
        if(key.Length==1){char c=char.ToUpperInvariant(key[0]);if(char.IsLetterOrDigit(c))return c;}
        if(key.StartsWith("F",StringComparison.OrdinalIgnoreCase)&&int.TryParse(key[1..],out int f)&&f>=1&&f<=12)return(ushort)(0x70+f-1);
        throw new ArgumentException($"unsupported_key:{key}");
    }

    public static void Key(string key,bool down){var input=new INPUT{type=IK,U=new U{ki=new KEYBDINPUT{wVk=Vk(key),dwFlags=down?0:KUP}}};SendInput(1,[input],Marshal.SizeOf<INPUT>());}
    public static void KeyTap(string key){Key(key,true);Key(key,false);}
    public static void Combo(string[] keys){foreach(var key in keys)Key(key,true);for(int i=keys.Length-1;i>=0;i--)Key(keys[i],false);}
}
