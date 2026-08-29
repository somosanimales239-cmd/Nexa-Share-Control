using System.Runtime.InteropServices;

namespace NexaShareControl.Native;

internal record MonitorRecord(string MonitorId,string Name,int X,int Y,int Width,int Height,bool Primary,uint DpiX,uint DpiY);

internal static class MonitorInfo
{
    delegate bool MonitorEnumProc(IntPtr hMonitor, IntPtr hdc, ref RECT rect, IntPtr data);
    [StructLayout(LayoutKind.Sequential)] struct RECT { public int Left,Top,Right,Bottom; }
    [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Auto)]
    struct MONITORINFOEX
    {
        public int cbSize; public RECT rcMonitor; public RECT rcWork; public uint dwFlags;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst=32)] public string szDevice;
    }
    [StructLayout(LayoutKind.Sequential)] struct POINT { public int X,Y; }

    [DllImport("user32.dll")] static extern bool EnumDisplayMonitors(IntPtr hdc, IntPtr clip, MonitorEnumProc proc, IntPtr data);
    [DllImport("user32.dll",CharSet=CharSet.Auto)] static extern bool GetMonitorInfo(IntPtr hMonitor, ref MONITORINFOEX info);
    [DllImport("shcore.dll")] static extern int GetDpiForMonitor(IntPtr hMonitor,int dpiType,out uint dpiX,out uint dpiY);
    [DllImport("user32.dll")] static extern IntPtr MonitorFromPoint(POINT pt,uint flags);

    public static List<MonitorRecord> List()
    {
        var list = new List<MonitorRecord>();
        EnumDisplayMonitors(IntPtr.Zero,IntPtr.Zero,
            (IntPtr h, IntPtr hdc, ref RECT r, IntPtr data) =>
            {
                var info = new MONITORINFOEX { cbSize = Marshal.SizeOf<MONITORINFOEX>(), szDevice = "" };
                GetMonitorInfo(h, ref info);
                uint dx=96,dy=96; try { GetDpiForMonitor(h,0,out dx,out dy); } catch { }
                list.Add(new MonitorRecord(h.ToInt64().ToString(), info.szDevice ?? $"Monitor {list.Count+1}",
                    info.rcMonitor.Left,info.rcMonitor.Top,info.rcMonitor.Right-info.rcMonitor.Left,info.rcMonitor.Bottom-info.rcMonitor.Top,
                    (info.dwFlags & 1) != 0, dx,dy));
                return true;
            }, IntPtr.Zero);
        return list;
    }

    public static MonitorRecord Resolve(string? id)
    {
        var list=List();
        if(!string.IsNullOrWhiteSpace(id))
        {
            var hit=list.FirstOrDefault(m=>m.MonitorId==id || m.Name.Equals(id,StringComparison.OrdinalIgnoreCase));
            if(hit is not null) return hit;
        }
        return list.FirstOrDefault(m=>m.Primary) ?? list.FirstOrDefault() ?? new MonitorRecord("0","Default",0,0,1920,1080,true,96,96);
    }

    public static double GetScaleAtPoint(int x,int y)
    {
        var h=MonitorFromPoint(new POINT{X=x,Y=y},2); uint dx=96,dy=96;
        try { GetDpiForMonitor(h,0,out dx,out dy); } catch { }
        return Math.Round(dx/96.0,3);
    }
}
