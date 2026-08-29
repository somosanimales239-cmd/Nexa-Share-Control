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

    public static List<WindowRecord> ListWindows()
    {
        var list=new List<WindowRecord>();
        EnumWindows((h,_)=>
        {
            if(!IsWindowVisible(h))return true;
            var b=new StringBuilder(2048);GetWindowText(h,b,b.Capacity);
            var title=b.ToString();if(string.IsNullOrWhiteSpace(title))return true;
            GetWindowRect(h,out var r);GetWindowThreadProcessId(h,out uint pid);
            string process="";
            try{process=Process.GetProcessById((int)pid).ProcessName;}catch{}
            list.Add(new(h.ToInt64(),(int)pid,process,title,r.L,r.T,r.R-r.L,r.B-r.T,true,IsIconic(h)));
            return true;
        },IntPtr.Zero);
        return list.OrderBy(x=>x.ProcessName).ThenBy(x=>x.Title).ToList();
    }

    public static bool Activate(IntPtr h)
    {
        if(h==IntPtr.Zero)return false;
        if(IsIconic(h))ShowWindow(h,9);
        return SetForegroundWindow(h);
    }

    public static WindowRecord? GetActive()
    {
        var h=GetForegroundWindow();
        return ListWindows().FirstOrDefault(w=>w.WindowId==h.ToInt64());
    }
}
