using System.Text.Json;
using System.Text.Json.Nodes;

namespace NexaShareControl.Native;

internal static class Program
{
    static readonly JsonSerializerOptions JsonOptions = new() { PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower };

    static void Main()
    {
        Console.OutputEncoding = System.Text.Encoding.UTF8;
        string? line;
        while ((line = Console.ReadLine()) is not null)
        {
            if (string.IsNullOrWhiteSpace(line)) continue;
            JsonObject response;
            try
            {
                var req = JsonNode.Parse(line)?.AsObject() ?? throw new Exception("invalid_json");
                response = Handle(req["id"]?.GetValue<string>() ?? "", req["cmd"]?.GetValue<string>() ?? "", req);
            }
            catch (Exception ex)
            {
                response = new JsonObject { ["id"] = "", ["ok"] = false, ["error"] = ex.Message };
            }
            Console.WriteLine(response.ToJsonString(JsonOptions));
            Console.Out.Flush();
        }
    }

    static JsonObject Handle(string id, string cmd, JsonObject req)
    {
        JsonObject Ok() => new() { ["id"] = id, ["ok"] = true };
        switch (cmd)
        {
            case "ping": { var r = Ok(); r["pong"] = true; r["version"] = "1.1.0"; return r; }
            case "cursor.get": { var p = NativeInput.GetCursor(); var r = Ok(); r["x"] = p.X; r["y"] = p.Y; r["dpi_scale"] = MonitorInfo.GetScaleAtPoint(p.X,p.Y); return r; }
            case "mouse.move": NativeInput.Move(req); return Ok();
            case "mouse.click": NativeInput.Click(req["button"]?.GetValue<string>() ?? "left",1); return Ok();
            case "mouse.double_click": NativeInput.Click(req["button"]?.GetValue<string>() ?? "left",2); return Ok();
            case "mouse.down": NativeInput.Button(req["button"]?.GetValue<string>() ?? "left",true); return Ok();
            case "mouse.up": NativeInput.Button(req["button"]?.GetValue<string>() ?? "left",false); return Ok();
            case "mouse.drag": NativeInput.Drag(req); return Ok();
            case "mouse.wheel": NativeInput.Wheel(req["delta"]?.GetValue<int>() ?? 0); return Ok();
            case "keyboard.text": NativeInput.TypeText(req["text"]?.GetValue<string>() ?? ""); return Ok();
            case "keyboard.key": NativeInput.KeyTap(req["key"]?.GetValue<string>() ?? ""); return Ok();
            case "keyboard.key_down": NativeInput.Key(req["key"]?.GetValue<string>() ?? "",true); return Ok();
            case "keyboard.key_up": NativeInput.Key(req["key"]?.GetValue<string>() ?? "",false); return Ok();
            case "keyboard.combo":
            {
                var keys = req["keys"]?.AsArray().Select(x => x?.GetValue<string>() ?? "").Where(x => x.Length > 0).ToArray() ?? Array.Empty<string>();
                NativeInput.Combo(keys); return Ok();
            }
            case "window.list": { var r = Ok(); r["windows"] = JsonSerializer.SerializeToNode(WindowControl.ListWindows(),JsonOptions); return r; }
            case "window.activate": { var r = Ok(); r["activated"] = WindowControl.Activate(new IntPtr(req["window_id"]?.GetValue<long>() ?? 0)); return r; }
            case "window.get_active":
            {
                var a = WindowControl.GetActive(); var r = Ok();
                if (a is not null) { r["window_id"] = a.WindowId; r["title"] = a.Title; r["process_name"] = a.ProcessName; }
                return r;
            }
            case "monitor.list": { var r = Ok(); r["monitors"] = JsonSerializer.SerializeToNode(MonitorInfo.List(),JsonOptions); return r; }
            default: return new JsonObject { ["id"] = id, ["ok"] = false, ["error"] = "unsupported_command" };
        }
    }
}
