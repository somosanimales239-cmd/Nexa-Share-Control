using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;

namespace NexaShareControl.Native;

internal record WindowRecord(long WindowId,int ProcessId,string ProcessName,string Title,int X,int Y,int Width,int Height,bool IsVisible,bool IsMinimized);

internal static class WindowControl
{
    delegate bool EnumProc(IntPtr h,IntPtr l);
    [StructLayout(LayoutKind.Sequential)] struct RECT{public int L,T,R,B;}

    [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc callback,IntPtr data);
    [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
    [DllImport("user32.dll")] static extern bool IsIconic(IntPtr h);
    [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern int GetWindowText(IntPtr h,StringBuilder b,int c);
    [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h,out RECT r);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h,out uint p);
    [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr h);
    [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr h,int c);
    [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] static extern bool IsWindow(IntPtr h);

    static WindowRecord? Read(IntPtr h)
    {
        if(h==IntPtr.Zero||!IsWindow(h)||!IsWindowVisible(h))return null;
        var b=new StringBuilder(2048);GetWindowText(h,b,b.Capacity);
        var title=b.ToString();if(string.IsNullOrWhiteSpace(title))return null;
        if(!GetWindowRect(h,out var r))return null;
        GetWindowThreadProcessId(h,out uint pid);
        string process="";
        try{process=Process.GetProcessById((int)pid).ProcessName;}catch{}
        return new WindowRecord(h.ToInt64(),(int)pid,process,title,r.L,r.T,Math.Max(0,r.R-r.L),Math.Max(0,r.B-r.T),true,IsIconic(h));
    }

    public static List<WindowRecord> ListWindows()
    {
        var list=new List<WindowRecord>();
        EnumWindows((h,_)=>{var item=Read(h);if(item is not null&&item.Width>0&&item.Height>0)list.Add(item);return true;},IntPtr.Zero);
        return list.OrderBy(x=>x.ProcessName).ThenBy(x=>x.Title).ToList();
    }

    public static WindowRecord? Get(long id)=>Read(new IntPtr(id));

    public static bool Activate(IntPtr h)
    {
        if(h==IntPtr.Zero||!IsWindow(h))return false;
        if(IsIconic(h))ShowWindow(h,9);
        return SetForegroundWindow(h);
    }

    public static WindowRecord? GetActive()=>Read(GetForegroundWindow());
}
